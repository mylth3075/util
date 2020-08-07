import fs from 'fs';
import path from 'path';
import {readJsonSync, outputJsonSync, outputFileSync, copySync, removeSync} from 'fs-extra';
import isEqual from 'lodash/isEqual';
import omit from 'lodash/omit';
import set from 'lodash/set';
import kebabCase from 'lodash/kebabCase';

import {logMessage, throwError} from './util';

export function buildDocumentation(indexFile: string, destinationDirectory: string) {
  if (!fs.existsSync(indexFile)) {
    throwError(`The documentation index file is missing (file: '${indexFile}')`);
  }

  logMessage(
    `Building documentation from '${path.relative(process.cwd(), indexFile)}' to '${path.relative(
      process.cwd(),
      destinationDirectory
    )}'...`
  );

  const sourceDirectory = path.dirname(indexFile);

  const contents = readJsonSync(indexFile);

  if (fs.existsSync(destinationDirectory)) {
    if (!fs.existsSync(path.join(destinationDirectory, 'index.json'))) {
      throwError(
        `Cannot clean a destination directory that has not been generated by this tool (directory: '${path.relative(
          process.cwd(),
          destinationDirectory
        )}')`
      );
    }

    removeSync(destinationDirectory);
  }

  outputJsonSync(path.join(destinationDirectory, 'index.json'), contents, {spaces: 2});

  for (const book of contents.books) {
    for (const chapter of book.chapters) {
      const destinationFile = path.resolve(destinationDirectory, chapter.file);

      if (chapter.source !== undefined) {
        const sources: string[] = Array.isArray(chapter.source) ? chapter.source : [chapter.source];
        const sourceFiles = sources.map((source) => path.resolve(sourceDirectory, source));
        generateChapter(sourceFiles, destinationFile);
      } else {
        const sourceFile = path.resolve(sourceDirectory, chapter.file);
        copyChapter(sourceFile, destinationFile);
      }
    }
  }

  logMessage(
    `Documentation successfully built in '${path.relative(process.cwd(), destinationDirectory)}'`
  );
}

function copyChapter(sourceFile: string, destinationFile: string) {
  if (!fs.existsSync(sourceFile)) {
    throwError(`A documentation file is missing (file: '${sourceFile}')`);
  }

  logMessage(`Copying chapter from '${path.relative(process.cwd(), sourceFile)}'...`);

  copySync(sourceFile, destinationFile);
}

type Context = {
  sourceFile: string;
  className: string | undefined;
};

type Entry = {
  name: string;
  types: string[];
  description: string;
  alias: string | undefined;
  params: Parameter[];
  return: string | undefined;
  example: string | undefined;
  category: string | undefined;
};

type Parameter = {
  name: string;
  description: string;
  isOptional: boolean;
};

function generateChapter(sourceFiles: string[], destinationFile: string) {
  let markdownByCategories: {[category: string]: string} = {};

  for (const sourceFile of sourceFiles) {
    if (!fs.existsSync(sourceFile)) {
      throwError(`A documentation source file is missing (file: '${sourceFile}')`);
    }

    logMessage(`Generating chapter from '${path.relative(process.cwd(), sourceFile)}'...`);

    const source = fs.readFileSync(sourceFile, {encoding: 'utf8'});
    let sourceIndex = 0;
    const entries = new Array<Entry>();
    let previousEntry: Entry | undefined;
    const context: Context = {sourceFile, className: undefined};

    while (true) {
      const startIndex = source.indexOf('/**\n', sourceIndex);

      if (startIndex === -1) {
        break;
      }

      const endIndex = source.indexOf('*/\n', startIndex + '/**\n'.length);

      if (endIndex === -1) {
        throwError(
          `Couldn't handle a JSDoc comment (issue: 'Comment terminator is missing', file: '${sourceFile}')`
        );
      }

      let jsDocComment = source.slice(startIndex + '/**\n'.length, endIndex);

      jsDocComment = jsDocComment
        .split('\n')
        .map((jsDocLine) => {
          jsDocLine = jsDocLine.trimLeft();

          if (jsDocLine === '*') {
            jsDocLine = '';
          } else if (jsDocLine.startsWith('* ')) {
            jsDocLine = jsDocLine.slice('* '.length);
          }

          return jsDocLine;
        })
        .join('\n');

      sourceIndex = endIndex + '*/\n'.length;

      const entry = handleJSDocComment({jsDocComment, source, sourceIndex, context});

      const entryIsSimilar = isEqual(omit(entry, 'types'), omit(previousEntry, 'types'));

      if (entryIsSimilar) {
        previousEntry!.types.push(...entry.types);
      } else {
        entries.push(entry);
        previousEntry = entry;
      }
    }

    for (const entry of entries) {
      let markdown = '';

      markdown += entry.types.includes('class') ? '### ' : '##### ';

      if (
        entry.types.includes('constructor') ||
        entry.types.includes('class-method') ||
        entry.types.includes('instance-method') ||
        entry.types.includes('function') ||
        entry.types.includes('decorator')
      ) {
        let name = entry.name;

        if (entry.types.includes('decorator')) {
          name = `@${name}`;
        }

        markdown += `\`${name}(${formatFunctionParams(entry.params)})\``;
      } else if (entry.types.includes('type')) {
        markdown += `\`${entry.name}\``;
      } else {
        markdown += entry.name;
      }

      for (let name of entry.types) {
        let type: string | undefined;

        if (name === 'class') {
          type = 'primary';
        } else if (name === 'constructor' || name === 'class-method') {
          type = 'secondary';
        } else if (name === 'instance-method') {
          type = 'secondary-outline';
        } else if (name === 'function') {
          type = 'tertiary-outline';
        } else if (name === 'decorator') {
          type = 'tertiary';
        } else if (name === 'type') {
          type = 'primary-outline';
        } else if (name === 'async' || name === 'possibly-async') {
          type = 'outline';
        }

        name = name.replace(/-/g, ' ');

        markdown += ` <badge${type !== undefined ? ` type="${type}"` : ''}>${name}</badge>`;
      }

      let headerId: string | undefined;
      const kebabName = kebabCase(entry.name);

      if (entry.types.includes('class')) {
        headerId = `${kebabName}-class`;
      } else if (entry.types.includes('constructor')) {
        headerId = 'constructor';
      } else if (entry.types.includes('class-method') && entry.types.includes('instance-method')) {
        headerId = `${kebabName}-dual-method`;
      } else if (entry.types.includes('class-method')) {
        headerId = `${kebabName}-class-method`;
      } else if (entry.types.includes('instance-method')) {
        headerId = `${kebabName}-instance-method`;
      } else if (entry.types.includes('function')) {
        headerId = `${kebabName}-function`;
      } else if (entry.types.includes('decorator')) {
        headerId = `${kebabName}-decorator`;
      } else if (entry.types.includes('type')) {
        headerId = `${kebabName}-type`;
      }

      if (headerId !== undefined) {
        markdown += ` {#${headerId}}`;
      }

      markdown += `\n`;
      markdown += `\n`;

      markdown += `${entry.description}\n`;

      if (entry.alias !== undefined) {
        markdown += `\n`;
        markdown += `**Alias:**\n`;
        markdown += `\n`;
        markdown += `\`${entry.alias}()\`\n`;
      }

      if (entry.params.length > 0) {
        markdown += `\n`;
        markdown += `**Parameters:**\n`;
        markdown += `\n`;
        markdown += formatParams(entry.params);
      }

      if (entry.return !== undefined) {
        markdown += `\n`;
        markdown += `**Returns:**\n`;
        markdown += `\n`;
        markdown += `${entry.return}\n`;
      }

      if (entry.example !== undefined) {
        markdown += `\n`;
        markdown += `**Example:**\n`;
        markdown += `\n`;
        markdown += `${entry.example}`;
      }

      markdown = markdown.replace(/﹫/g, '@');

      const category = entry.category || '';

      if (markdownByCategories[category] === undefined) {
        markdownByCategories[category] = '';
      } else {
        markdownByCategories[category] += '\n';
      }

      markdownByCategories[category] += markdown;
    }
  }

  let chapterMarkdown = '';

  for (const [category, markdown] of Object.entries(markdownByCategories)) {
    if (category !== '') {
      if (chapterMarkdown !== '') {
        chapterMarkdown += '\n';
      }

      chapterMarkdown += `#### ${category}\n\n`;
    }

    chapterMarkdown += markdown;
  }

  outputFileSync(destinationFile, chapterMarkdown);
}

function handleJSDocComment({
  jsDocComment,
  // @ts-ignore
  source,
  // @ts-ignore
  sourceIndex,
  context
}: {
  jsDocComment: string;
  source: string;
  sourceIndex: number;
  context: Context;
}) {
  const entry: Entry = {
    name: '',
    types: [],
    description: '',
    alias: undefined,
    params: [],
    return: undefined,
    example: undefined,
    category: undefined
  };

  const lineTerminatorIndex = source.indexOf('\n', sourceIndex);

  if (lineTerminatorIndex === -1) {
    throwError(
      `Couldn't handle a JSDoc comment (issue: 'A source line is missing after the JSDoc comment', file: '${context.sourceFile}')`
    );
  }

  const sourceLine = source.slice(sourceIndex, lineTerminatorIndex);

  handleSourceLine({entry, sourceLine, context});

  let jsDocIndex = 0;

  do {
    jsDocIndex = handleJSDocSection({entry, jsDocComment, jsDocIndex, context});
  } while (jsDocIndex !== -1);

  if (entry.name === '') {
    throwError(
      `Couldn't handle a JSDoc comment (issue: 'Unable to detect the name of an entry', file: '${
        context.sourceFile
      }', jsDocComment: ${JSON.stringify(jsDocComment)})`
    );
  }

  entry.description = entry.description.trim();

  entry.types = Array.from(new Set(entry.types)); // Deduplicate types

  return entry;
}

function handleSourceLine({
  entry,
  sourceLine,
  context
}: {
  entry: Entry;
  sourceLine: string;
  context: Context;
}) {
  sourceLine = sourceLine.trimLeft();

  let matches = sourceLine.match(/^export class (\w+)/);

  if (matches !== null) {
    entry.name = matches[1];
    entry.types.push('class');
    context.className = entry.name;
    return;
  }

  matches = sourceLine.match(/^export (async )?function (\w+)/);

  if (matches !== null) {
    entry.name = matches[2];
    entry.types.push('function');
    if (matches[1]) {
      entry.types.push('async');
    }
    return;
  }

  if (context.className !== undefined) {
    matches = sourceLine.match(/^constructor\(/);

    if (matches !== null) {
      entry.name = `new ${context.className}`;
      entry.types.push('constructor');
      return;
    }

    matches = sourceLine.match(/^static (?:get )?(async )?(\w+)/);

    if (matches !== null) {
      entry.name = matches[2];
      entry.types.push('class-method');
      if (matches[1]) {
        entry.types.push('async');
      }
      return;
    }

    matches = sourceLine.match(/^(async )?(\w+)/);

    if (matches !== null) {
      entry.name = matches[2];
      entry.types.push('instance-method');
      if (matches[1]) {
        entry.types.push('async');
      }
      return;
    }
  }
}

function handleJSDocSection({
  entry,
  jsDocComment,
  jsDocIndex,
  context
}: {
  entry: Entry;
  jsDocComment: string;
  jsDocIndex: number;
  context: Context;
}) {
  let newJSDocIndex = jsDocComment.indexOf('\n', jsDocIndex);

  if (newJSDocIndex === -1) {
    return -1;
  }

  let jsDocLine = jsDocComment.slice(jsDocIndex, newJSDocIndex);

  newJSDocIndex++;

  const matches = jsDocLine.match(/^(@\w+)/);

  if (matches !== null) {
    const tag = matches[1];
    const content = jsDocLine.slice(tag.length).trimLeft();

    if (tag === '@alias') {
      handleAliasTag({entry, content});
      return newJSDocIndex;
    }

    if (tag === '@param') {
      handleParamTag({entry, content, context});
      return newJSDocIndex;
    }

    if (tag === '@returns') {
      handleReturnsTag({entry, content});
      return newJSDocIndex;
    }

    if (tag === '@example') {
      newJSDocIndex = handleExampleTag({entry, jsDocComment, jsDocIndex: newJSDocIndex, context});
      return newJSDocIndex;
    }

    if (tag === '@decorator') {
      handleDecoratorTag({entry});
      return newJSDocIndex;
    }

    if (tag === '@typedef') {
      handleTypeDefTag({entry, content});
      return newJSDocIndex;
    }

    if (tag === '@async') {
      handleAsyncTag({entry});
      return newJSDocIndex;
    }

    if (tag === '@possiblyasync') {
      handlePossiblyAsyncTag({entry});
      return newJSDocIndex;
    }

    if (tag === '@category') {
      handleCategoryTag({entry, content});
      return newJSDocIndex;
    }

    throwError(
      `Couldn't handle a JSDoc section (issue: "The tag '${tag}' is not supported", file: '${
        context.sourceFile
      }', jsDocComment: ${JSON.stringify(jsDocComment)})`
    );
  }

  entry.description += jsDocLine + '\n';

  return newJSDocIndex;
}

function handleAliasTag({entry, content}: {entry: Entry; content: string}) {
  entry.alias = content;
}

function handleParamTag({
  entry,
  content,
  context
}: {
  entry: Entry;
  content: string;
  context: Context;
}) {
  const matches = content.match(/^(\[?[\w.]+\]?)/);

  if (matches === null) {
    throwError(
      `Couldn't handle a JSDoc '@param' tag (issue: 'Unable to find the name of the parameter', file: '${
        context.sourceFile
      }', content: ${JSON.stringify(content)})`
    );
  }

  let name = matches[1];
  const description = content.slice(name.length).trimLeft();
  let isOptional;

  if (name.startsWith('[') && name.endsWith(']')) {
    isOptional = true;
    name = name.slice(1, -1);
  } else {
    isOptional = false;
  }

  entry.params.push({name, description, isOptional});
}

function handleReturnsTag({entry, content}: {entry: Entry; content: string}) {
  entry.return = content;
}

function handleExampleTag({
  entry,
  jsDocComment,
  jsDocIndex,
  context
}: {
  entry: Entry;
  jsDocComment: string;
  jsDocIndex: number;
  context: Context;
}) {
  if (!jsDocComment.slice(jsDocIndex).startsWith('```')) {
    throwError(
      `Couldn't handle a JSDoc '@example' tag (issue: 'The following line should start a code block', file: '${
        context.sourceFile
      }', jsDocComment: ${JSON.stringify(jsDocComment)})`
    );
  }

  let newJSDocIndex = jsDocIndex + '```'.length;

  newJSDocIndex = jsDocComment.indexOf('```\n', newJSDocIndex);

  if (newJSDocIndex === -1) {
    throwError(
      `Couldn't handle a JSDoc '@example' tag (issue: 'Couldn't find a code block terminator', file: '${
        context.sourceFile
      }', jsDocComment: ${JSON.stringify(jsDocComment)})`
    );
  }

  newJSDocIndex += '```\n'.length;

  let example = jsDocComment.slice(jsDocIndex, newJSDocIndex);

  if (entry.example === undefined) {
    entry.example = example;
  } else {
    entry.example += example;
  }

  return newJSDocIndex;
}

function handleDecoratorTag({entry}: {entry: Entry}) {
  entry.types = entry.types.filter((type) => type !== 'function');
  entry.types.unshift('decorator');
}

function handleTypeDefTag({entry, content}: {entry: Entry; content: string}) {
  entry.name = content;
  entry.types.push('type');
}

function handleAsyncTag({entry}: {entry: Entry}) {
  entry.types.push('async');
}

function handlePossiblyAsyncTag({entry}: {entry: Entry}) {
  entry.types.push('possibly-async');
}

function handleCategoryTag({entry, content}: {entry: Entry; content: string}) {
  entry.category = content;
}

function formatFunctionParams(params: Parameter[]) {
  const simplifiedParams: {name: string; isOptional: boolean}[] = [];

  for (const param of params) {
    let {name, isOptional} = param;

    const index = name.indexOf('.');

    if (index !== -1) {
      name = name.slice(0, index);
    }

    const simplifiedParam = simplifiedParams.find((param) => param.name === name);

    if (simplifiedParam === undefined) {
      simplifiedParams.push({name, isOptional});
    } else {
      if (simplifiedParam.isOptional && !isOptional) {
        simplifiedParam.isOptional = false;
      }
    }
  }

  const formattedParams = simplifiedParams
    .map(({name, isOptional}) => (isOptional ? `[${name}]` : name))
    .join(', ');

  return formattedParams;
}

type ParametersObject = {[name: string]: string | ParametersObject};

function formatParams(params: Parameter[]) {
  const paramsObject: ParametersObject = {};

  for (const {name, description} of params) {
    set(paramsObject, name, description);
  }

  return _formatParams(paramsObject, 0);
}

function _formatParams(paramsObject: ParametersObject, level: number) {
  let markdown = '';

  for (const [name, value] of Object.entries(paramsObject)) {
    const indent = '  '.repeat(level);

    if (typeof value === 'object') {
      markdown += `${indent}* \`${name}\`:\n`;
      markdown += _formatParams(value, level + 1);
    } else {
      markdown += `${indent}* \`${name}\`: ${value}\n`;
    }
  }

  return markdown;
}
