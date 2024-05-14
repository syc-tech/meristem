import { readFileSync, lstatSync, existsSync } from 'fs';
import { resolve } from 'path';
import glob from 'glob';
import yaml from 'js-yaml';
import toml from '@iarna/toml'
import ignore from 'ignore';

function buildTreeStructure(directory: string): { [key: string]: any } {
  const ig = ignore();
  const ignoreFilePath = resolve(directory, '.meristemignore');

  if (existsSync(ignoreFilePath)) {
    const ignoreFileContent = readFileSync(ignoreFilePath, 'utf8');
    ig.add(ignoreFileContent.split(/\r?\n/));
  }

  const buildTree = (dirPath: string) => {
    const tree: { [key: string]: any } = {};
    const files = glob.sync('*', { cwd: dirPath }).filter(file => !ig.ignores(file));

    files.forEach(file => {
      const fullPath = resolve(dirPath, file);
      if (lstatSync(fullPath).isDirectory()) {
        const metadataPath = resolve(fullPath, '.meristem.toml');
        let description = null;
        if (existsSync(metadataPath) && lstatSync(metadataPath).isFile()) {
          try {
            const metadata = toml.parse(readFileSync(metadataPath, 'utf8')) as { description: string };
            if (metadata && metadata.description) {
              description = metadata.description;
            }
          } catch (e) {
            console.warn('Error reading or parsing .meristem.yml:', e);
          }
        }
        tree[file] = { ...buildTree(fullPath), description };
      } else {
        tree[file] = null;
      }
    });
    return tree;
  };

  return buildTree(directory);
}

function generateDirectoryTreeJSON(directory: string): string {
  const tree = buildTreeStructure(directory);
  return JSON.stringify(tree, null, 2);
}

function generateDirectoryTreeTextual(directory: string): string {
  const rawTree: { [key: string]: any } = buildTreeStructure(directory);
  const formatTree = (tree: { [key: string]: any }, prefix = '') => {
    return Object.keys(tree).reduce((acc: string[], key, index, array) => {
      const isLast = index === array.length - 1;
      const marker = isLast ? '└── ' : '├── ';
      const newPrefix = isLast ? '    ' : '|   ';
      const node = tree[key];
      let line = prefix + marker + key;
      if (node && typeof node === 'object') {
        if (node.description) {
          line += ': <<' + node.description + '>>';
        }
        acc.push(line);
        acc.push(formatTree(node, prefix + newPrefix));
      } else {
        acc.push(line);
      }
      return acc;
    }, []).join('\n');
  };

  return formatTree(rawTree);
}

export {
  generateDirectoryTreeJSON,
  generateDirectoryTreeTextual,
};



export const generateFileInfo = async (path: string): Promise<string> => {
  const fileContents = readFileSync
  return fileContents.toString();
}