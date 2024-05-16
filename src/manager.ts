import simpleGit, { SimpleGit } from 'simple-git';
import { prompt } from './prompt';
import { exec } from 'child_process';
import { generateDirectoryTreeJSON } from './overview';
import { existsSync } from 'fs';
import { OpenAI } from 'openai';

import _ from 'lodash';


export type MeristemIssue = {
  description: string
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  branchName: string
  lastModified: Date
  error?: string
  completed: boolean
}

export type MeristemConfig = {
  active: MeristemIssue,
  archive: MeristemIssue[]
}


export class Manager {
  
  activeIssue: MeristemIssue;
  archive: MeristemIssue[] = [];

  constructor(
    public config: MeristemConfig,
    public setConfig: (config: MeristemConfig) => void
  ) {
    // add new entry into meristem-issues.yml
    this.activeIssue = this.config.active;
    this.archive = this.config.archive;    

  }


  async updateConfig() {

    this.setConfig({
      ...this.config,
      active: {
        ...this.activeIssue,
        lastModified: new Date()
      },
      archive: this.archive
    });
  }

  async updateIssue(issue: MeristemIssue, updatedIssue: Partial<MeristemIssue>) {


    this.activeIssue =  { ...issue, ...updatedIssue };
    this.updateConfig();
  }

  async workOnIssue(issue: MeristemIssue) {

    console.log('working on issue...');


    // check if branch exists, if so check it out else create it
    await createOrCheckoutBranch(`meristem/${issue.branchName}`);

    console.log('branch created or checked out...');

    const errorMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = issue.error ? [{
      content: `The following error was encountered when attempting to run tests: ${issue.error}`,
      role: "user"
    }] : [];

    console.log(`prompting for diff... ${ issue.error ? `with error --- ${issue.error}` : ''}`);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...issue.messages, ...errorMessage];



    const { result: diff, messages: resultMessages } = await promptForDiff(issue.description, messages);

    // Verify the correctness of diffs before applying them
    if (!await verifyDiff(diff)) {
      console.error('Diff verification failed. Please ensure the diff is correct and try again.');
      return;
    }

    await applyChanges(diff);

    await this.runTests()

  }

  async verifyDiff(diff: string): Promise<boolean> {
    // Logic to verify the correctness of the diff
    // This could involve checking the diff format, ensuring it applies cleanly, etc.
    // Placeholder for actual implementation
    return true; // Assuming verification is successful for now
  }

  async runTests() {

    console.log('running tests...');

    const { success, error } = await new Promise<{ success: boolean, error: string }>((resolve, reject) => {
      const childProcess = exec('npm test');
      childProcess.on('exit', (code) => {
        if (code === 0) {
          resolve({ success: true, error: '' });
        } else {
          resolve({ success: false, error: 'Tests failed' });
        }
      });
    });

    if (!success) {
      this.updateIssue(this.activeIssue, { error });
      // Enhance error logging for better traceability
      console.error(`Test execution failed with error: ${error}`);
    }

  }
  

  async getActiveIssue() {
    const activeIssues = {
      ...this.config.active,
      messages: this.config.active.messages ? this.config.active.messages : [],
    };
    return activeIssues;
  }

  async markIssueAsComplete() {
    this.activeIssue.completed = true;
    this.archive.push(this.activeIssue);
    this.updateConfig();
  }

  async run() {
    this.getActiveIssue().then((issue: MeristemIssue) => {
      if (!issue){
        console.log('issue', issue)
        throw new Error("No active issue found");

        return
      }

      if (!issue.branchName) {
        throw new Error("No branch name found in active issue");
        return
      }

      if (!issue.description) {
        throw new Error("No description found in active issue");
        return
      }


      this.workOnIssue(issue);
      return 
    });

  }


}



async function promptForDiff(description: string, messages?: OpenAI.Chat.Completions.ChatCompletionMessageParam[] ): Promise<{ result: string, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]}> {


  const overview = await generateDirectoryTreeJSON(process.cwd());

  console.log("overview -- ", overview);

  const newMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
        role: "system",
        content: `You are a helpful assistant that does one of the following actions by prominently
        displaying the number of the action with the required information in json format.  Please only 
        output parseable JSON.

        (1) generates git diff patches that adds, modifies, or removes tested code in response to user issue description, as well as 
            adding or updating .meristem.toml files, which must include at least a single key "description" with the value being a long string 
            value summarizing the directory contents .  Please output literally nothing except a parseable git diff format.

        (2) prompts user for the contents of a certain file or directory with the following format:
            show path: \`show path: <path>\` 

        Use the prompt for file contents until you have the information you need, and then execute #1.
        `
    },
    {
        role: "user",
        content: `The following is an issue related to a codebase you have access to. ${description}
        `
    },
    {
      role: "user",
      content: `The following is an overview of the project code: ${overview}`
    }
  
  ];

  const messagesToPrompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = (messages && messages?.length !== 0) ? messages : newMessages;

  const { result, messages: resultMessages } = await prompt( messagesToPrompt ) ;

  


  return { result, messages: resultMessages };
}

async function applyChanges(diff: string): Promise<void> {
    const childProcess = exec(`git apply - `);
    childProcess.stdin?.write(diff);
    childProcess.stdin?.end();
    const { stdout, stderr } = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
        childProcess.on('exit', (code) => {
            if (code === 0) {
                resolve({ stdout: '', stderr: '' });
            } else {
                reject(new Error(`Failed to apply changes: ${stderr}`));
            }
        });
    });
    if (stderr) {
        throw new Error(`Failed to apply changes: ${stderr}`);
    }
}

async function createOrCheckoutBranch(branchName: string): Promise<void> {
    const git: SimpleGit = simpleGit();
    const branches = await git.branch();
    if (branches.all.includes(branchName)) {
      await git.checkout(branchName);
      return;
    } else {
      await git.checkoutLocalBranch(branchName);
      return;
    }
}

async function addAndCommitChanges(branchName: string, message: string): Promise<void> {
  const git: SimpleGit = simpleGit();
  await git.add('./*');
  await git.commit(message);
  await git.push(['-u', 'origin', branchName]);
}

async function readStdin(): Promise<string> {
    const stdin = process.stdin;
    stdin.setEncoding('utf-8');

    let input = '';
    for await (const chunk of stdin) {
        input += chunk;
    }
    return input;
}
