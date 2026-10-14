/**
 * What people say, per language. Parser data, not interface copy: each command
 * has several phrasings, which a translation catalog cannot hold. Written
 * without accents and in lower case; the parser normalises speech the same way.
 *
 * {x} is free text (a page, a button, a search). {n} is a number, in digits or
 * words. Patterns are tried in the order of COMMAND_ORDER in grammar.ts.
 *
 * A host adds a language by adding a table. Have a native speaker review it:
 * these were written to be plausible, not tested with real speech.
 */
export interface PhraseTable {
  back: string[]
  forward: string[]
  scrollDown: string[]
  scrollUp: string[]
  top: string[]
  bottom: string[]
  readPage: string[]
  readSelection: string[]
  stop: string[]
  pause: string[]
  resume: string[]
  showNumbers: string[]
  hideNumbers: string[]
  textUp: string[]
  textDown: string[]
  textReset: string[]
  nextHeading: string[]
  prevHeading: string[]
  next: string[]
  prev: string[]
  activate: string[]
  help: string[]
  sleep: string[]
  panel: string[]
  /** Slot commands */
  clickNumber: string[]
  search: string[]
  click: string[]
  navigate: string[]
  /** "open {x}": a page if {x} names one, else a click */
  open: string[]
  numbers: Record<string, number>
  /** Politeness and fillers stripped from either end */
  filler: string[]
}

const en: PhraseTable = {
  back: ['go back', 'back', 'previous page', 'last page'],
  forward: ['go forward', 'forward', 'next page'],
  scrollDown: ['scroll down', 'page down', 'down', 'move down'],
  scrollUp: ['scroll up', 'page up', 'up', 'move up'],
  top: ['scroll to top', 'go to top', 'top of page', 'top of the page', 'top'],
  bottom: ['scroll to bottom', 'go to bottom', 'bottom of page', 'bottom of the page', 'bottom'],
  readPage: ['read page', 'read this page', 'read the page', 'read aloud', 'read it', 'read'],
  readSelection: ['read selection', 'read selected', 'read the selection', 'read selected text'],
  stop: ['stop', 'stop reading', 'be quiet', 'quiet', 'silence', 'shut up'],
  pause: ['pause', 'pause reading', 'wait'],
  resume: ['resume', 'continue', 'carry on', 'keep reading', 'keep going'],
  showNumbers: ['show numbers', 'show links', 'number links', 'number the links', 'show labels', 'numbers'],
  hideNumbers: ['hide numbers', 'hide links', 'hide labels', 'clear numbers'],
  textUp: ['bigger text', 'larger text', 'text bigger', 'make text bigger', 'make it bigger', 'increase text size', 'zoom in', 'bigger'],
  textDown: ['smaller text', 'text smaller', 'make text smaller', 'make it smaller', 'decrease text size', 'zoom out', 'smaller'],
  textReset: ['reset text size', 'normal text size', 'normal text', 'reset zoom'],
  nextHeading: ['next heading', 'next section', 'next title'],
  prevHeading: ['previous heading', 'previous section', 'last heading'],
  next: ['next', 'next item', 'tab', 'move forward'],
  prev: ['previous', 'previous item', 'shift tab', 'move back'],
  activate: ['press enter', 'enter', 'activate', 'select it', 'click it', 'press it', 'open it'],
  help: ['help', 'what can i say', 'voice commands', 'show commands', 'commands'],
  sleep: ['stop listening', 'go to sleep', 'sleep', 'goodbye', 'turn off voice'],
  panel: ['accessibility settings', 'open accessibility settings', 'accessibility', 'open accessibility', 'settings panel'],
  clickNumber: ['click {n}', 'press {n}', 'select {n}', 'choose {n}', 'tap {n}', 'number {n}', 'go to {n}'],
  search: ['search for {x}', 'search {x}', 'find {x}', 'look for {x}', 'look up {x}'],
  click: ['click on {x}', 'click {x}', 'press {x}', 'select {x}', 'choose {x}', 'tap {x}', 'push {x}'],
  navigate: ['go to {x}', 'take me to {x}', 'navigate to {x}', 'show me {x}', 'show {x}', '{x} page', 'the {x} page'],
  open: ['open {x}', 'open the {x}', 'open up {x}'],
  numbers: {
    one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, ate: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  },
  filler: ['please', 'can you', 'could you', 'would you', 'i want to', 'i would like to', 'now', 'the'],
}

const fr: PhraseTable = {
  back: ['retour', 'revenir', 'reviens', 'page precedente', 'en arriere'],
  forward: ['avancer', 'avance', 'page suivante'],
  scrollDown: ['defiler vers le bas', 'descendre', 'descends', 'vers le bas', 'en bas'],
  scrollUp: ['defiler vers le haut', 'monter', 'monte', 'vers le haut', 'en haut'],
  top: ['haut de page', 'haut de la page', 'tout en haut', 'debut de page'],
  bottom: ['bas de page', 'bas de la page', 'tout en bas', 'fin de page'],
  readPage: ['lire la page', 'lis la page', 'lire a voix haute', 'lire', 'lis'],
  readSelection: ['lire la selection', 'lis la selection', 'lire le texte selectionne'],
  stop: ['arrete', 'arreter', 'stop', 'silence', 'tais toi', 'arrete de lire'],
  pause: ['pause', 'mets en pause', 'attends'],
  resume: ['reprendre', 'reprends', 'continuer', 'continue'],
  showNumbers: ['afficher les numeros', 'montrer les numeros', 'affiche les numeros', 'numeros', 'numeroter les liens'],
  hideNumbers: ['masquer les numeros', 'cacher les numeros', 'enlever les numeros'],
  textUp: ['texte plus grand', 'agrandir le texte', 'agrandir', 'plus grand', 'zoomer'],
  textDown: ['texte plus petit', 'reduire le texte', 'reduire', 'plus petit', 'dezoomer'],
  textReset: ['taille normale', 'texte normal', 'reinitialiser la taille'],
  nextHeading: ['titre suivant', 'section suivante'],
  prevHeading: ['titre precedent', 'section precedente'],
  next: ['suivant', 'element suivant', 'tabulation'],
  prev: ['precedent', 'element precedent'],
  activate: ['valider', 'entrer', 'entree', 'activer', 'clique dessus'],
  help: ['aide', 'que puis je dire', 'commandes vocales', 'commandes'],
  sleep: ["arrete d'ecouter", 'arrete d ecouter', 'dors', 'au revoir', 'desactiver la voix'],
  panel: ["parametres d'accessibilite", 'parametres d accessibilite', 'accessibilite', "ouvrir l'accessibilite"],
  clickNumber: ['cliquer sur {n}', 'clique sur {n}', 'cliquer {n}', 'clique {n}', 'numero {n}', 'appuyer sur {n}'],
  search: ['rechercher {x}', 'recherche {x}', 'chercher {x}', 'cherche {x}', 'trouver {x}', 'trouve {x}'],
  click: ['cliquer sur {x}', 'clique sur {x}', 'appuyer sur {x}', 'appuie sur {x}', 'selectionner {x}', 'selectionne {x}', 'choisir {x}'],
  navigate: ['aller a {x}', 'aller aux {x}', 'aller au {x}', 'va a {x}', 'va aux {x}', 'va au {x}', 'afficher {x}', 'affiche {x}', 'montre {x}', 'page {x}', 'la page {x}'],
  open: ['ouvrir {x}', 'ouvre {x}', 'ouvrir la {x}', 'ouvre la {x}', 'ouvrir le {x}', 'ouvre le {x}'],
  numbers: {
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
    onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, 'dix sept': 17, 'dix huit': 18,
    'dix neuf': 19, vingt: 20,
  },
  filler: ["s'il te plait", "s'il vous plait", 's il te plait', 's il vous plait', 'peux tu', 'pouvez vous', 'je veux', 'maintenant', 'la', 'le', 'les'],
}

const es: PhraseTable = {
  back: ['atras', 'volver', 'vuelve', 'regresar', 'regresa', 'pagina anterior'],
  forward: ['adelante', 'avanzar', 'pagina siguiente'],
  scrollDown: ['bajar', 'baja', 'desplazar abajo', 'hacia abajo', 'abajo'],
  scrollUp: ['subir', 'sube', 'desplazar arriba', 'hacia arriba', 'arriba'],
  top: ['ir arriba del todo', 'al principio', 'inicio de la pagina', 'principio de la pagina'],
  bottom: ['al final', 'final de la pagina', 'abajo del todo'],
  readPage: ['leer la pagina', 'lee la pagina', 'leer en voz alta', 'lee en voz alta', 'leer', 'lee'],
  readSelection: ['leer la seleccion', 'lee la seleccion', 'leer el texto seleccionado'],
  stop: ['para', 'parar', 'detener', 'detente', 'silencio', 'alto', 'deja de leer'],
  pause: ['pausa', 'pausar', 'espera'],
  resume: ['continuar', 'continua', 'seguir', 'sigue', 'reanudar'],
  showNumbers: ['mostrar numeros', 'muestra los numeros', 'mostrar los numeros', 'numeros', 'numerar enlaces'],
  hideNumbers: ['ocultar numeros', 'oculta los numeros', 'quitar numeros'],
  textUp: ['texto mas grande', 'agrandar texto', 'agrandar', 'aumentar texto', 'mas grande', 'acercar'],
  textDown: ['texto mas pequeno', 'reducir texto', 'reducir', 'mas pequeno', 'alejar'],
  textReset: ['tamano normal', 'texto normal', 'restablecer tamano'],
  nextHeading: ['siguiente titulo', 'titulo siguiente', 'siguiente seccion'],
  prevHeading: ['titulo anterior', 'seccion anterior'],
  next: ['siguiente', 'siguiente elemento', 'tabulador'],
  prev: ['anterior', 'elemento anterior'],
  activate: ['activar', 'aceptar', 'entrar', 'intro', 'abrelo', 'pulsalo'],
  help: ['ayuda', 'que puedo decir', 'comandos de voz', 'comandos'],
  sleep: ['deja de escuchar', 'dormir', 'adios', 'apagar la voz'],
  panel: ['ajustes de accesibilidad', 'accesibilidad', 'abrir accesibilidad', 'configuracion de accesibilidad'],
  clickNumber: ['clic en {n}', 'clic {n}', 'haz clic en {n}', 'pulsa {n}', 'pulsar {n}', 'numero {n}', 'toca {n}'],
  search: ['buscar {x}', 'busca {x}', 'encontrar {x}', 'encuentra {x}'],
  click: ['hacer clic en {x}', 'haz clic en {x}', 'clic en {x}', 'pulsar {x}', 'pulsa {x}', 'seleccionar {x}', 'selecciona {x}', 'toca {x}', 'elige {x}'],
  navigate: ['ir a {x}', 'ir al {x}', 've a {x}', 've al {x}', 'llevame a {x}', 'mostrar {x}', 'muestra {x}', 'pagina de {x}', 'la pagina de {x}'],
  open: ['abrir {x}', 'abre {x}', 'abrir el {x}', 'abre el {x}', 'abrir la {x}', 'abre la {x}'],
  numbers: {
    uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
    once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
    diecinueve: 19, veinte: 20,
  },
  filler: ['por favor', 'puedes', 'podrias', 'quiero', 'ahora', 'el', 'la', 'los', 'las'],
}

export const PHRASES: Record<string, PhraseTable> = { en, fr, es }
