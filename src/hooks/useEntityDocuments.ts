import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import {
  buildStoragePath,
  extractDocument,
  htmlToMarkdown,
  MAX_CONTENT_CHARS,
} from '../lib/document-extract'
import type {
  DocumentEntityType,
  DocumentVisibility,
  EntityDocument,
  EntityDocumentSummary,
  ExtractedFields,
} from '../types'

const BUCKET = 'entity-documents'
const DOMAIN = 'entity-documents'

/** How much of the scraped text the field extractor is given. */
const EXTRACTION_INPUT_CHARS = 12_000

/** Stages the upload modal reports while a file is being ingested. */
export type UploadStage = 'idle' | 'uploading' | 'scraping' | 'analyzing' | 'done'

/**
 * Documents attached to a grant or project.
 *
 * Listing goes through the get_entity_documents RPC rather than the table:
 * a restricted document has to be visible without being readable, which
 * row-level RLS cannot express. The RPC returns metadata only — no scraped
 * content, and no storage_path unless the caller has access.
 */
export function useEntityDocuments(entityType: DocumentEntityType, entityId: string | undefined) {
  const fetchDocuments = async (): Promise<EntityDocumentSummary[]> => {
    const { data, error } = await (supabase as any).rpc('get_entity_documents', {
      p_entity_type: entityType,
      p_entity_id: entityId,
    })
    if (error) throw error
    return (data as EntityDocumentSummary[]) || []
  }

  const query = useQuery({
    queryKey: keys.list(DOMAIN, { entityType, entityId }),
    queryFn: fetchDocuments,
    enabled: !!entityId,
  })

  return {
    documents: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Full row — RLS returns nothing unless the caller has access. */
export function useDocumentContent(documentId: string | undefined) {
  const fetchDocument = async (): Promise<EntityDocument | null> => {
    const { data, error } = await (supabase as any)
      .from('entity_documents')
      .select('*')
      .eq('id', documentId)
      .maybeSingle()
    if (error) throw error
    return (data as EntityDocument) || null
  }

  const query = useQuery({
    queryKey: keys.detail(DOMAIN, documentId || ''),
    queryFn: fetchDocument,
    enabled: !!documentId,
  })

  return {
    document: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Signed URL for a private document (1 hour), same shape as verification docs. */
export async function getDocumentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

/** Opens the original file in a new tab. Returns false when the URL could not be signed. */
export async function openDocument(path: string, fileName?: string): Promise<boolean> {
  const url = await getDocumentUrl(path)
  if (!url) return false
  const link = window.document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  if (fileName) link.download = fileName
  link.click()
  return true
}

async function getAuthHeader(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? `Bearer ${token}` : null
}

/**
 * Asks the AI to propose values for the parent entity's columns.
 * Failure is never fatal — the document is already stored by this point.
 */
async function requestFieldExtraction(
  entityType: DocumentEntityType,
  markdown: string
): Promise<ExtractedFields> {
  const authorization = await getAuthHeader()
  if (!authorization) return {}

  const res = await fetch('/api/extract-fields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ entityType, markdown: markdown.slice(0, EXTRACTION_INPUT_CHARS) }),
  })
  if (!res.ok) throw new Error(`Field extraction failed (${res.status})`)

  const body = await res.json()
  return (body.fields as ExtractedFields) || {}
}

export interface UploadDocumentParams {
  entityType: DocumentEntityType
  entityId: string
  ownerId: string
  file: File
  title: string
  description?: string
  visibility: DocumentVisibility
  /** Skip the AI pass — used when the caller cannot edit the parent entity anyway. */
  skipExtraction?: boolean
}

/**
 * Upload → store row → scrape → extract fields.
 *
 * The row is inserted as soon as the binary lands, so a scrape or AI failure
 * downgrades the document rather than losing it. `stage` drives the modal's
 * progress copy.
 */
export function useUploadDocument() {
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<UploadStage>('idle')

  const mutation = useMutation({
    mutationFn: async (params: UploadDocumentParams): Promise<EntityDocument> => {
      setStage('uploading')

      const storagePath = buildStoragePath({
        ownerId: params.ownerId,
        entityType: params.entityType,
        entityId: params.entityId,
        fileName: params.file.name,
      })

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, params.file, { upsert: false, contentType: params.file.type || undefined })
      if (uploadError) throw uploadError

      const { data: inserted, error: insertError } = await (supabase as any)
        .from('entity_documents')
        .insert({
          entity_type: params.entityType,
          entity_id: params.entityId,
          owner_id: params.ownerId,
          title: params.title,
          description: params.description || null,
          storage_path: storagePath,
          file_name: params.file.name,
          mime_type: params.file.type || 'application/octet-stream',
          file_size: params.file.size,
          visibility: params.visibility,
          extraction_status: 'processing',
        })
        .select()
        .single()

      if (insertError) {
        // Do not leave an orphan object behind in the bucket
        await supabase.storage.from(BUCKET).remove([storagePath])
        throw insertError
      }

      const document = inserted as EntityDocument

      setStage('scraping')
      const scraped = await extractDocument(params.file)

      let extractedFields: ExtractedFields = {}
      let error = scraped.error

      if (scraped.status === 'done' && scraped.markdown && !params.skipExtraction) {
        setStage('analyzing')
        try {
          extractedFields = await requestFieldExtraction(params.entityType, scraped.markdown)
        } catch (err: any) {
          // The scrape succeeded; only the AI pass did not. Keep the content.
          error = err?.message || 'Field extraction failed'
        }
      }

      const { data: updated, error: updateError } = await (supabase as any)
        .from('entity_documents')
        .update({
          content_html: scraped.html,
          markdown: scraped.markdown,
          extraction_status: scraped.status,
          extraction_error: error,
          extracted_fields: extractedFields,
        })
        .eq('id', document.id)
        .select()
        .single()

      if (updateError) throw updateError

      setStage('done')
      return updated as EntityDocument
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    },
    onError: () => {
      setStage('idle')
    },
  })

  return {
    uploadDocument: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error,
    stage,
    resetStage: () => setStage('idle'),
  }
}

/** Metadata edits (title, description, visibility). */
export function useUpdateDocument() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      documentId: string
      title?: string
      description?: string | null
      visibility?: DocumentVisibility
    }) => {
      const patch: Record<string, any> = {}
      if (params.title !== undefined) patch.title = params.title
      if (params.description !== undefined) patch.description = params.description
      if (params.visibility !== undefined) patch.visibility = params.visibility

      const { error } = await (supabase as any)
        .from('entity_documents')
        .update(patch)
        .eq('id', params.documentId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    },
  })

  return { updateDocument: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/**
 * Saves the WYSIWYG editor's HTML and regenerates the markdown from it, so the
 * two shapes never drift — the AI always reads what the user actually sees.
 */
export function useSaveDocumentContent() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: { documentId: string; html: string }) => {
      const html = params.html.slice(0, MAX_CONTENT_CHARS)
      const markdown = await htmlToMarkdown(html)

      const { error } = await (supabase as any)
        .from('entity_documents')
        .update({
          content_html: html,
          markdown,
          // Hand-edited content is no longer a raw scrape
          extraction_status: 'done',
          extraction_error: null,
        })
        .eq('id', params.documentId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    },
  })

  return { saveContent: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/** Re-runs the AI pass against the current content, e.g. after hand-editing it. */
export function useReextractFields() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      documentId: string
      entityType: DocumentEntityType
      markdown: string
    }): Promise<ExtractedFields> => {
      const fields = await requestFieldExtraction(params.entityType, params.markdown)
      const { error } = await (supabase as any)
        .from('entity_documents')
        .update({ extracted_fields: fields, extraction_error: null })
        .eq('id', params.documentId)
      if (error) throw error
      return fields
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    },
  })

  return { reextract: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/** Clears the proposals once they have been reviewed. */
export function useClearExtractedFields() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await (supabase as any)
        .from('entity_documents')
        .update({ extracted_fields: {} })
        .eq('id', documentId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    },
  })

  return { clearFields: mutation.mutateAsync, loading: mutation.isPending }
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: { documentId: string; storagePath: string | null }) => {
      const { error } = await (supabase as any)
        .from('entity_documents')
        .delete()
        .eq('id', params.documentId)
      if (error) throw error

      if (params.storagePath) {
        // Best effort — the row is the source of truth, a stray object is not
        await supabase.storage.from(BUCKET).remove([params.storagePath])
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    },
  })

  return { deleteDocument: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
