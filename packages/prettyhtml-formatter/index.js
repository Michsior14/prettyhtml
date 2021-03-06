'use strict'

const minify = require('rehype-minify-whitespace')({ newlines: true })
const sensitive = require('html-whitespace-sensitive-tag-names')
const is = require('unist-util-is')
const isElement = require('hast-util-is-element')
const repeat = require('repeat-string')
const visit = require('unist-util-visit-parents')
const voids = require('html-void-elements')
const find = require('unist-util-find')
const toString = require('hast-util-to-string')
const prettier = require('prettier')

module.exports = format

/* Constants. */
const single = '\n'
const space = ' '
const double = '\n\n'
const re = /\n/g

const DOUBLE_BRACKET_INTERPOLATION_REGEXP = /\{\{([\s\S]*?)\}\}/g
const SINGLE_BRACKET_INTERPOLATION_REGEXP = /\{([\s\S]*?)\}/g
const ARROW_PERC_INTERPOLATION_REGEXP = /<%([\s\S]*?)%>/g

/* Format white-space. */
function format(options) {
  const settings = options || {}
  let tabWidth = settings.tabWidth || 2
  let useTabs = settings.useTabs
  let indentInitial = settings.indentInitial
  let usePrettier = settings.usePrettier !== false
  let prettierOpts = settings.prettier
  let indent

  if (useTabs) {
    indent = '\t'
  } else {
    indent = repeat(space, tabWidth)
  }

  return transform

  function transform(tree) {
    // check if we are in page mode to indent the first level
    indentInitial = isPageMode(tree)

    let root = minify(tree)

    visit(root, visitor)

    return root

    function visitor(node, parents) {
      // holds a copy of the children
      let children = node.children || []
      let length = children.length
      let index = -1
      let result
      let child
      let newline
      let level = parents.length

      if (indentInitial === false) {
        level--
      }

      /**
       * When 'prettyhtml-ignore' flag is set we can ignore the next element
       * In order to ignore the whole subtree we have to return the index from the next+1 element
       */
      if (is('comment', node)) {
        if (node.value.indexOf('prettyhtml-ignore') !== -1) {
          const parent = parents[parents.length - 1]
          const nodeIndex = parent ? parent.children.indexOf(node) : null
          if (nodeIndex !== null) {
            for (let i = nodeIndex; i < parent.children.length; i++) {
              const child = parent.children[i]
              if (isElement(child)) {
                return i + 1
              }
            }
          }
        }

        /**
         * indent last line of comment
         * e.g
         * <!--
         *   foo
         *    -->
         * to
         * <!--
         *   foo
         * -->
         */

        let commentLines = node.value.split(single)
        if (commentLines.length > 1) {
          commentLines[commentLines.length - 1] =
            repeat(indent, level - 1) +
            commentLines[commentLines.length - 1].trim()
          node.value = commentLines.join(single)
        }
      }

      /**
       * If we find whitespace-sensitive nodes / inlines we skip it
       * e.g pre, textarea
       */
      if (ignore(parents.concat(node))) {
        setData(node, 'indentLevel', level - 1)

        // clear empty script, textarea, pre, style tags
        if (length) {
          const empty = containsOnlyEmptyTextNodes(node)
          if (empty) {
            node.children = []
          }
          if (usePrettier && !empty) {
            prettierEmbeddedContent(node, level, indent, prettierOpts)
          }
        }

        return visit.SKIP
      }

      /**
       * Indent newlines in `text`.
       * e.g <p>foo <strong>bar</strong></p> to
       * <p>
       *    foo
       *    <strong>bar</strong>
       * </p>
       * Remove leading and trailing spaces and tabs
       */
      index = -1
      while (++index < length) {
        let child = children[index]

        // only indent text in nodes
        // root text nodes should't influence other root nodes
        if (node.type === 'root') {
          break
        }

        if (is('text', child)) {
          // when a newline is found we assume that we can indent it on separate lines
          // and not beside the open and closed tags
          if (child.value.indexOf(single) !== -1) {
            newline = true
          }
          child.value = child.value
            // remove leading and last tab characters
            .replace(/^[ \t]+|[ \t]+$/g, '')
            // reduce newlines to one newline
            // $& contains the lastMatch
            .replace(re, '$&' + repeat(indent, level))
        }
      }

      // reset
      result = []
      index = -1

      node.children = result

      let prevChild

      if (length) {
        // walk through children
        // hint: a child has no children informations we already walking through
        // the tree
        while (++index < length) {
          child = children[index]

          let indentLevel = level

          setData(child, 'indentLevel', indentLevel)

          /**
           * Insert 2 newline
           * 1. check if an element is followed by a conditional comment
           * 2. check if a comment is followed by a conditional comment
           */
          if (
            isElementAfterConditionalComment(node, child, index, prevChild) ||
            isConCommentFollowedByComment(node, child, index, prevChild)
          ) {
            result.push({
              type: 'text',
              value: double + repeat(indent, indentLevel)
            })
          } else if (
            /**
             * Insert 1 newline
             * 1. should we break before child node is started?
             * 2. don't break when a newline was already inserted before
             * 3. break text in newline when it's the first node
             */
            (!endsWithNewline(prevChild) &&
              beforeChildNodeAddedHook(
                node,
                children,
                child,
                index,
                prevChild
              )) ||
            (newline && index === 0)
          ) {
            result.push({
              type: 'text',
              value: single + repeat(indent, indentLevel)
            })
          }

          prevChild = child

          result.push(child)
        }
      }

      // 1. should we break before node is closed?
      // 2. break text when node text was aligned
      if (afterChildNodesAddedHook(node, prevChild) || newline) {
        result.push({
          type: 'text',
          value: single + repeat(indent, level - 1)
        })
      }
    }
  }
}

function endsWithNewline(node) {
  return is('text', node) && node.value && /\s*\n\s*$/.test(node.value)
}

function startsWithNewline(node) {
  return is('text', node) && node.value && /^\s*\n/.test(node.value)
}

function handleTemplateExpression(child, children) {
  if (isTemplateExpression(child.value)) {
    // dont touch nodes with single text element
    if (containsOnlyTextNodes({ children })) {
      return false
    }

    // dont add newline when newline is already in text
    if (startsWithNewline(child)) {
      return false
    }

    return true
  }
}

function beforeChildNodeAddedHook(node, children, child, index, prev) {
  if (handleTemplateExpression(child, children)) {
    return true
  }

  // insert newline when tag is on the same line as the comment
  if (is('comment', prev)) {
    return true
  }

  if (isElement(child, ['script', 'style']) && index !== 0) {
    return true
  }

  // don't add newline on the first elmement
  const isRootElement = node.type === 'root' && index === 0
  if (isRootElement) {
    return false
  }
  const isChildTextElement = is('text', child)

  return !isChildTextElement
}

function afterChildNodesAddedHook(node, prev) {
  const hasChilds = node.children.length > 0

  /**
   * e.g <label><input/>foo</label>
   */
  if (hasChilds && !containsOnlyTextNodes(node) && !isVoid(node)) {
    return true
  }

  /**
   * e.g <label>foo</label>
   */
  const isPrevRawText = is('text', prev)
  return hasChilds && !isVoid(node) && !isPrevRawText
}

function isTemplateExpression(value) {
  // do no track informations
  DOUBLE_BRACKET_INTERPOLATION_REGEXP.lastIndex = 0
  SINGLE_BRACKET_INTERPOLATION_REGEXP.lastIndex = 0
  ARROW_PERC_INTERPOLATION_REGEXP.lastIndex = 0

  // erb ruby templates
  if (ARROW_PERC_INTERPOLATION_REGEXP.test(value)) {
    return true
  }

  // angular, vue
  if (DOUBLE_BRACKET_INTERPOLATION_REGEXP.test(value)) {
    return true
  }

  // svelte
  if (SINGLE_BRACKET_INTERPOLATION_REGEXP.test(value)) {
    return true
  }

  return false
}

function containsOnlyTextNodes(node) {
  const children = node.children || []

  if (children.length === 0) {
    return false
  }

  return children.every(n => is('text', n))
}

function containsOnlyEmptyTextNodes(node) {
  const children = node.children || []

  if (children.length === 0) {
    return false
  }

  return children.every(n => is('text', n) && /^\s+$/.test(n.value))
}

function isElementAfterConditionalComment(node, child, index, prev) {
  // insert double newline when conditional comment is before element
  if (
    is('comment', prev) &&
    prev.value.indexOf('if') !== -1 &&
    isElement(child)
  ) {
    return true
  }
  return false
}

function isConCommentFollowedByComment(node, child, index, prev) {
  // insert double newline when conditional comment is before a non conditional comment
  if (
    is('comment', prev) &&
    prev.value.toLowerCase().indexOf('if') !== -1 &&
    is('comment', child) &&
    child.value.toLowerCase().indexOf('if') === -1
  ) {
    return true
  }
  return false
}

function isVoid(node) {
  return voids.indexOf(node.tagName) !== -1
}

function ignore(nodes) {
  var index = nodes.length

  while (index--) {
    if (sensitive.indexOf(nodes[index].tagName) !== -1) {
      return true
    }
  }

  return false
}

function prettierEmbeddedContent(node, level, indent, prettierOpts) {
  if (isElement(node, 'style')) {
    const content = toString(node)
    node.children = []
    const typeAttr = node.properties.type
      ? node.properties.type.toLowerCase()
      : ''
    let parser = 'css'
    if (typeAttr === 'text/x-scss') {
      parser = 'scss'
    } else if (typeAttr === 'text/less') {
      parser = 'less'
    } else {
      const langAttr = node.properties.lang
        ? node.properties.lang.toLowerCase()
        : ''
      if (langAttr === 'postcss') {
        parser = 'css'
      } else if (langAttr === 'scss') {
        parser = 'scss'
      } else if (langAttr === 'less') {
        parser = 'less'
      }
    }

    let formattedText = prettier.format(
      content,
      Object.assign(
        {
          parser
        },
        prettierOpts
      )
    )
    formattedText = indentPrettierOutput(formattedText, level)

    node.children = [
      { type: 'text', value: single },
      { type: 'text', value: formattedText },
      { type: 'text', value: repeat(indent, level - 1) }
    ]
  } else if (isElement(node, 'script')) {
    const content = toString(node)
    node.children = []
    const typeAttr = node.properties.type
      ? node.properties.type.toLowerCase()
      : ''
    let parser = 'babylon'

    if (typeAttr.indexOf('json') !== -1) {
      parser = 'json'
    } else if (typeAttr === 'application/x-typescript') {
      parser = 'typescript'
    } else {
      const langAttr = node.properties.lang
        ? node.properties.lang.toLowerCase()
        : ''

      if (langAttr === 'ts' || langAttr === 'tsx') {
        parser = 'typescript'
      }
    }

    let formattedText = prettier.format(
      content,
      Object.assign(
        {
          parser
        },
        prettierOpts
      )
    )
    formattedText = indentPrettierOutput(formattedText, level)
    // in order to prevent parsing issues
    // https://github.com/inikulin/parse5/issues/262
    formattedText = formattedText.replace(/<\/script\s*>/g, '<\\/script>')

    node.children = [
      { type: 'text', value: single },
      { type: 'text', value: formattedText },
      { type: 'text', value: repeat(indent, level - 1) }
    ]
  }
}

function indentPrettierOutput(formattedText, level) {
  let lines = formattedText.split(single)

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].replace(/\s+/g, '').length) {
      lines[i] = repeat('  ', level) + lines[i]
    }
  }

  return lines.join(single)
}

function setData(node, key, value) {
  let data = node.data || {}
  node.data = data
  node.data[key] = value
}

function isPageMode(ast) {
  return !find(ast, function(node) {
    return isElement(node, ['html', 'body', 'head'])
  })
}
