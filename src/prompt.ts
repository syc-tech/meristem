import OpenAI from 'openai';
import { config } from 'dotenv';
import { generateFileInfo } from './overview';
import { exec } from 'child_process';

config({ path: `${process.cwd()}/.env` });

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OpenAI API key not found');
}

const configuration = {
  apiKey: process.env.OPENAI_API_KEY,
};

const openai = new OpenAI(configuration);

export const prompt = async (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<{ result: string, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] }> => {

  console.log("Prompting for diff...  ----\n", messages[messages.length - 1].content);

  const fullResponse = await getFullResponse(messages, []);


  if (!fullResponse) {
    throw new Error('No choices provided');
  }

  const { success, error } = await checkDiff(fullResponse);

  const { path, error: pathError } = await parsePath(fullResponse);

  if (success) {
    return { result: fullResponse, messages: [...messages, { role: "system", content: fullResponse }] };
  } else if ( path && !pathError) {
    
    const fileContents = await generateFileInfo(path);
    console.log("File contents for: ", path);
    return prompt([...messages, { role: "system", content: fullResponse }, { role: "user", content: `Here are the contents of the file at ${path}: \n${fileContents}` }]);
  } else {
    console.log("Invalid diff provided, prompting again...", fullResponse);
    return prompt([...messages, { role: "user", content: `Please provide a response that is either ONLY a parseable git diff, or a request for a file's contents with the following format: \`show path: <path>\`` }]);
  }
};

const getFullResponse = async (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], pastResponses: string[]): Promise<string> => {
  if (!messages || messages.length === 0) {
    throw new Error('No messages provided');
  }

  console.log("Continuing last prompt...  ----\n", messages[messages.length - 1].content)

  const response: OpenAI.Chat.Completions.ChatCompletion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages,
  });

  const choice = response.choices[0];
  const finishReason = choice.finish_reason;

  if (finishReason === 'stop') {
    console.log("Stopping prompt...  ----\n", response.choices);
    if (choice.message.content) {
      return choice.message.content;
    }
  }

  const result = await getFullResponse(
    [
      ...messages,
      // { role: "system", content: `You were cut off while generating the following response, please continue from there: ${choice.message.content}` },
      { role: "user", content: `` },
    ],
    choice.message.content ? [...pastResponses, choice.message.content] : pastResponses
  );

  return `${choice.message.content}${result}`;
};

const parsePath = async (fullResponse: string): Promise<{ path: string, error: string }> => {
  const path = fullResponse.match(/show path: (.*)/)?.[1];

  if (!path) {
    return { path: '', error: 'No path provided' };
  }

  return { path, error: '' };
};

const checkDiff = async (diff: string): Promise<{ success: boolean, error: string }> => {
  return new Promise((resolve, reject) => {
    const childProcess = exec(`git apply --check -`);

    let stderr = '';

    childProcess.stdin?.write(diff);
    childProcess.stdin?.end();

    childProcess.stderr?.on('data', (data) => {
      stderr += data;
    });

    childProcess.on('exit', (code) => {
      if (code === 0) {
        resolve({ success: true, error: '' });
      } else {
        resolve({ success: false, error: stderr });
      }
    });
  });
};
