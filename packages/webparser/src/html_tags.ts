import { TagContentType, TagDefinition } from './tags'

export class HtmlTagDefinition implements TagDefinition {
  private closedByChildren: { [key: string]: boolean } = {}

  closedByParent: boolean = false
  // TODO(issue/24571): remove '!'.
  requiredParents!: { [key: string]: boolean }
  // TODO(issue/24571): remove '!'.
  parentToAdd!: string
  implicitNamespacePrefix: string | null
  contentType: TagContentType
  isVoid: boolean
  ignoreFirstLf: boolean
  canSelfClose: boolean = false

  constructor({
    closedByChildren,
    requiredParents,
    implicitNamespacePrefix,
    contentType = TagContentType.PARSABLE_DATA,
    closedByParent = false,
    isVoid = false,
    ignoreFirstLf = false
  }: {
    closedByChildren?: string[]
    closedByParent?: boolean
    requiredParents?: string[]
    implicitNamespacePrefix?: string
    contentType?: TagContentType
    isVoid?: boolean
    ignoreFirstLf?: boolean
  } = {}) {
    if (closedByChildren && closedByChildren.length > 0) {
      closedByChildren.forEach(
        tagName => (this.closedByChildren[tagName] = true)
      )
    }
    this.isVoid = isVoid
    this.closedByParent = closedByParent || isVoid
    if (requiredParents && requiredParents.length > 0) {
      this.requiredParents = {}
      // The first parent is the list is automatically when none of the listed parents are present
      this.parentToAdd = requiredParents[0]
      requiredParents.forEach(tagName => (this.requiredParents[tagName] = true))
    }
    this.implicitNamespacePrefix = implicitNamespacePrefix || null
    this.contentType = contentType
    this.ignoreFirstLf = ignoreFirstLf
  }

  requireExtraParent(currentParent: string): boolean {
    if (!this.requiredParents) {
      return false
    }

    if (!currentParent) {
      return true
    }

    const lcParent = currentParent.toLowerCase()
    const isParentTemplate =
      lcParent === 'template' || currentParent === 'ng-template'
    return !isParentTemplate && this.requiredParents[lcParent] != true
  }

  isClosedByChild(name: string): boolean {
    return this.isVoid || name.toLowerCase() in this.closedByChildren
  }
}

let _DEFAULT_TAG_DEFINITION!: HtmlTagDefinition

// see http://www.w3.org/TR/html51/syntax.html#optional-tags
// This implementation does not fully conform to the HTML5 spec.
let TAG_DEFINITIONS: Map<
  string,
  { [key: string]: HtmlTagDefinition }
> = new Map()

export function getHtmlTagDefinition(
  tagName: string,
  ignoreFirstLf: boolean
): HtmlTagDefinition {
  const cacheKey = `ignoreFirstLf:${ignoreFirstLf}`

  // we store different views of the tag definition that's why we need a cache invalidation strategy
  if (!TAG_DEFINITIONS.has(cacheKey)) {
    _DEFAULT_TAG_DEFINITION = new HtmlTagDefinition()
    TAG_DEFINITIONS.set(cacheKey, {
      base: new HtmlTagDefinition({ isVoid: true }),
      meta: new HtmlTagDefinition({ isVoid: true }),
      area: new HtmlTagDefinition({ isVoid: true }),
      embed: new HtmlTagDefinition({ isVoid: true }),
      link: new HtmlTagDefinition({ isVoid: true }),
      img: new HtmlTagDefinition({ isVoid: true }),
      input: new HtmlTagDefinition({ isVoid: true }),
      param: new HtmlTagDefinition({ isVoid: true }),
      hr: new HtmlTagDefinition({ isVoid: true }),
      br: new HtmlTagDefinition({ isVoid: true }),
      source: new HtmlTagDefinition({ isVoid: true }),
      track: new HtmlTagDefinition({ isVoid: true }),
      wbr: new HtmlTagDefinition({ isVoid: true }),
      p: new HtmlTagDefinition({
        closedByChildren: [
          'address',
          'article',
          'aside',
          'blockquote',
          'div',
          'dl',
          'fieldset',
          'footer',
          'form',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'header',
          'hgroup',
          'hr',
          'main',
          'nav',
          'ol',
          'p',
          'pre',
          'section',
          'table',
          'ul'
        ],
        closedByParent: true
      }),
      thead: new HtmlTagDefinition({ closedByChildren: ['tbody', 'tfoot'] }),
      tbody: new HtmlTagDefinition({
        closedByChildren: ['tbody', 'tfoot'],
        closedByParent: true
      }),
      tfoot: new HtmlTagDefinition({
        closedByChildren: ['tbody'],
        closedByParent: true
      }),
      tr: new HtmlTagDefinition({
        closedByChildren: ['tr'],
        requiredParents: ['tbody', 'tfoot', 'thead'],
        closedByParent: true
      }),
      td: new HtmlTagDefinition({
        closedByChildren: ['td', 'th'],
        closedByParent: true
      }),
      th: new HtmlTagDefinition({
        closedByChildren: ['td', 'th'],
        closedByParent: true
      }),
      col: new HtmlTagDefinition({
        requiredParents: ['colgroup'],
        isVoid: true
      }),
      svg: new HtmlTagDefinition({ implicitNamespacePrefix: 'svg' }),
      math: new HtmlTagDefinition({ implicitNamespacePrefix: 'math' }),
      li: new HtmlTagDefinition({
        closedByChildren: ['li'],
        closedByParent: true
      }),
      dt: new HtmlTagDefinition({ closedByChildren: ['dt', 'dd'] }),
      dd: new HtmlTagDefinition({
        closedByChildren: ['dt', 'dd'],
        closedByParent: true
      }),
      rb: new HtmlTagDefinition({
        closedByChildren: ['rb', 'rt', 'rtc', 'rp'],
        closedByParent: true
      }),
      rt: new HtmlTagDefinition({
        closedByChildren: ['rb', 'rt', 'rtc', 'rp'],
        closedByParent: true
      }),
      rtc: new HtmlTagDefinition({
        closedByChildren: ['rb', 'rtc', 'rp'],
        closedByParent: true
      }),
      rp: new HtmlTagDefinition({
        closedByChildren: ['rb', 'rt', 'rtc', 'rp'],
        closedByParent: true
      }),
      optgroup: new HtmlTagDefinition({
        closedByChildren: ['optgroup'],
        closedByParent: true
      }),
      option: new HtmlTagDefinition({
        closedByChildren: ['option', 'optgroup'],
        closedByParent: true
      }),
      pre: new HtmlTagDefinition({ ignoreFirstLf }),
      listing: new HtmlTagDefinition({ ignoreFirstLf }),
      style: new HtmlTagDefinition({ contentType: TagContentType.RAW_TEXT }),
      script: new HtmlTagDefinition({ contentType: TagContentType.RAW_TEXT }),
      title: new HtmlTagDefinition({
        contentType: TagContentType.ESCAPABLE_RAW_TEXT
      }),
      textarea: new HtmlTagDefinition({
        contentType: TagContentType.ESCAPABLE_RAW_TEXT,
        ignoreFirstLf
      })
    })
  }
  return TAG_DEFINITIONS.get(cacheKey)[tagName] || _DEFAULT_TAG_DEFINITION
}

export function isKnownHTMLTag(tagName: string): boolean {
  return tagName.toUpperCase() in TAG_DICTIONARY
}

const TAG_DICTIONARY: { [name: string]: string } = {
  A: 'a',
  ADDRESS: 'address',
  ANNOTATION_XML: 'annotation-xml',
  APPLET: 'applet',
  AREA: 'area',
  ARTICLE: 'article',
  ASIDE: 'aside',

  B: 'b',
  BASE: 'base',
  BASEFONT: 'basefont',
  BGSOUND: 'bgsound',
  BIG: 'big',
  BLOCKQUOTE: 'blockquote',
  BODY: 'body',
  BR: 'br',
  BUTTON: 'button',

  CAPTION: 'caption',
  CENTER: 'center',
  CODE: 'code',
  COL: 'col',
  COLGROUP: 'colgroup',

  DD: 'dd',
  DESC: 'desc',
  DETAILS: 'details',
  DIALOG: 'dialog',
  DIR: 'dir',
  DIV: 'div',
  DL: 'dl',
  DT: 'dt',

  EM: 'em',
  EMBED: 'embed',

  FIELDSET: 'fieldset',
  FIGCAPTION: 'figcaption',
  FIGURE: 'figure',
  FONT: 'font',
  FOOTER: 'footer',
  FOREIGN_OBJECT: 'foreignObject',
  FORM: 'form',
  FRAME: 'frame',
  FRAMESET: 'frameset',

  H1: 'h1',
  H2: 'h2',
  H3: 'h3',
  H4: 'h4',
  H5: 'h5',
  H6: 'h6',
  HEAD: 'head',
  HEADER: 'header',
  HGROUP: 'hgroup',
  HR: 'hr',
  HTML: 'html',

  I: 'i',
  IMG: 'img',
  IMAGE: 'image',
  INPUT: 'input',
  IFRAME: 'iframe',

  KEYGEN: 'keygen',

  LABEL: 'label',
  LI: 'li',
  LINK: 'link',
  LISTING: 'listing',

  MAIN: 'main',
  MALIGNMARK: 'malignmark',
  MARQUEE: 'marquee',
  MATH: 'math',
  MENU: 'menu',
  META: 'meta',
  MGLYPH: 'mglyph',
  MI: 'mi',
  MO: 'mo',
  MN: 'mn',
  MS: 'ms',
  MTEXT: 'mtext',

  NAV: 'nav',
  NOBR: 'nobr',
  NOFRAMES: 'noframes',
  NOEMBED: 'noembed',
  NOSCRIPT: 'noscript',

  OBJECT: 'object',
  OL: 'ol',
  OPTGROUP: 'optgroup',
  OPTION: 'option',

  P: 'p',
  PARAM: 'param',
  PLAINTEXT: 'plaintext',
  PRE: 'pre',

  RB: 'rb',
  RP: 'rp',
  RT: 'rt',
  RTC: 'rtc',
  RUBY: 'ruby',

  S: 's',
  SCRIPT: 'script',
  SECTION: 'section',
  SELECT: 'select',
  SOURCE: 'source',
  SMALL: 'small',
  SPAN: 'span',
  STRIKE: 'strike',
  STRONG: 'strong',
  STYLE: 'style',
  SUB: 'sub',
  SUMMARY: 'summary',
  SUP: 'sup',

  TABLE: 'table',
  TBODY: 'tbody',
  TEMPLATE: 'template',
  TEXTAREA: 'textarea',
  TFOOT: 'tfoot',
  TD: 'td',
  TH: 'th',
  THEAD: 'thead',
  TITLE: 'title',
  TR: 'tr',
  TRACK: 'track',
  TT: 'tt',

  U: 'u',
  UL: 'ul',

  SVG: 'svg',

  VAR: 'var',

  WBR: 'wbr',

  XMP: 'xmp'
}
