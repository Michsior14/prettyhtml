#!/usr/bin/env node

'use strict'

const PassThrough = require('stream').PassThrough
const notifier = require('update-notifier')
const meow = require('meow')
const engine = require('unified-engine')
const unified = require('unified')
const report = require('vfile-reporter')
const { basename } = require('path')
const pack = require('./package')
const prettier = require('prettier')

// processing
const parse = require('@starptech/rehype-webparser')
const stringify = require('@starptech/prettyhtml-formatter/stringify')
const format = require('@starptech/prettyhtml-formatter')

const extensions = ['html']

notifier({ pkg: pack }).notify()

const prettierConfig = prettier.resolveConfig.sync(process.cwd()) || {}

var cli = meow(
  `
  Usage: prettyhtml [<glob> ...] [options ...],

  Options:

  --tab-width       Specify the number of spaces per indentation-level
  --print-width     Specify the maximum line length
  --use-tabs        Use tabs for indentation
  --single-quote    Use single instead of double quotes
  --use-prettier    Use prettier to format embedded content
  --stdin           Specify the standard stream as source (for pipe mode)
  --quiet           Do not report successful files

  Examples
    $ prettyhtml *.html
    $ prettyhtml *.html !example.html
    $ echo "<custom foo='bat'></custom>" | prettyhtml --stdin
    $ echo "<custom foo='bat'></custom>" --stdin ./test.html
  `,
  {
    autoHelp: true,
    autoVersion: true,
    flags: {
      tabWidth: {
        type: 'number',
        default: prettierConfig.tabWidth || 2
      },
      printWidth: {
        type: 'number',
        default: prettierConfig.printWidth || 80
      },
      useTabs: {
        type: 'boolean',
        default: prettierConfig.useTabs || false
      },
      singleQuote: {
        type: 'boolean',
        default: false
      },
      usePrettier: {
        type: 'boolean',
        default: true
      },
      stdin: {
        type: 'boolean',
        default: false
      },
      quiet: {
        type: 'boolean',
        default: false
      }
    }
  }
)

const settings = {
  processor: unified(),
  extensions: extensions,
  configTransform: transform,
  streamError: new PassThrough(), // sink errors
  rcName: '.prettyhtmlrc',
  packageField: 'prettyhtml',
  ignoreName: '.prettyhtmlignore',
  frail: false,
  defaultConfig: transform({ prettierConfig })
}

if (cli.flags.stdin === false) {
  if (cli.input.length === 0) {
    cli.showHelp()
  } else {
    settings.files = cli.input
    settings.output = true // Whether to overwrite the input files
    settings.out = false // Whether to write the processed file to streamOut

    engine(settings, processResult)
  }
} else {
  if (cli.input.length !== 0) {
    settings.output = basename(cli.input[0])
  }
  engine(settings, processResult)
}

function processResult(err, code, result) {
  const out = report(err || result.files, {
    quiet: cli.flags.quiet
  })

  if (out) {
    console.error(out)
  }

  process.exit(code)
}

function transform({ prettierConfig }) {
  const plugins = [
    [
      parse,
      {
        ignoreFirstLf: false,
        decodeEntities: false,
        selfClosingCustomElements: true
      }
    ],
    [
      format,
      {
        tabWidth: cli.flags.tabWidth,
        useTabs: cli.flags.useTabs,
        singleQuote: cli.flags.singleQuote,
        usePrettier: cli.flags.usePrettier,
        prettier: prettierConfig
      }
    ],
    [
      stringify,
      {
        tabWidth: cli.flags.tabWidth,
        printWidth: cli.flags.printWidth,
        singleQuote: cli.flags.singleQuote
      }
    ]
  ]
  return { plugins }
}
