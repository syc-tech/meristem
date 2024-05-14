import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import glob from 'glob';
import simpleGit, { SimpleGit } from 'simple-git';
import replaceInFile from 'replace-in-file';

async function readFiles(pattern: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        glob(pattern, (err: Error | null, files: string[]) => {
            if (err) {
                reject(err);
            } else {
                resolve(files);
            }
        });
    });
}

async function parseDescription(description: string): Promise<{ [key: string]: string }> {
    // Simple example of parsing: each line is a "find:replace" pair
    const changes: { [key: string]: string } = {};
    description.split('\n').forEach(line => {
        const [find, replace] = line.split(':').map(s => s.trim());
        if (find && replace) {
            changes[find] = replace;
        }
    });
    return changes;
}

async function applyChanges(files: string[], changes: { [key: string]: string }): Promise<void> {
    for (const file of files) {
        for (const [find, replace] of Object.entries(changes)) {
            await replaceInFile({
                files: file,
                from: new RegExp(find, 'g'),
                to: replace,
            });
        }
    }
}

async function createBranchWithChanges(branchName: string): Promise<void> {
    const git: SimpleGit = simpleGit();
    await git.checkoutLocalBranch(branchName);
    await git.add('./*');
    await git.commit(`Apply changes based on description`);
    await git.push(['-u', 'origin', branchName]);
}

async function main() {
    const description = `
        foo:bar
        hello:world
    `;

    const pattern = '**/*.txt'; // Adjust the pattern to match your files
    const files = await readFiles(pattern);
    const changes = await parseDescription(description);

    await applyChanges(files, changes);
    await createBranchWithChanges('feature/new-changes');
}

main().catch(err => console.error(err));
