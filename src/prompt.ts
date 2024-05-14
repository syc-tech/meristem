
import OpenAI from 'openai';

import { config } from 'dotenv';

import { generateFileInfo } from './overview';

import { exec } from 'child_process';


config({ path: `${process.cwd()}/.env`});


if (!process.env.OPENAI_API_KEY) {
  throw new Error('OpenAI API key not found')
}

const configuration = {
  apiKey: process.env.OPENAI_API_KEY,
};

const openai = new OpenAI(configuration);


export const prompt = async (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] ): Promise<string> => {


  const fullResponse = await getFullResponse(messages, [])


  if (!fullResponse) {
    throw new Error('No choices provided')
  }

  const { success, error } = await checkDiff(fullResponse)

  if (success) {

    return fullResponse

  } else if (fullResponse.match(/\(2\)/)) {
    const { path, error } = await parsePath(fullResponse)
    const fileContents = await generateFileInfo(path)
    return prompt([...messages, {role: "system", content: fullResponse }, { role: "user", content: `
      Here are the contents of the file at ${path}: \n${fileContents}
    ` }])
    

  } else {
    return prompt([...messages, { role: "user", content: `
      Please provide a response that is either a parseable git diff, or 
    ` }])
  }


}


const getFullResponse = async (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], pastResponses: string[] ): Promise<string> => {

  const response: OpenAI.Chat.Completions.ChatCompletion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo-1106',
    // messages: [
    //   {
    //     role: "system",
    //     content: systemPrompt
    //   },
    //   {
    //     role: "user",
    //     content: userPrompt
    //   }
    // ],
    messages,
  })

  const choice = response.choices[0]
  const finishReason = choice.finish_reason

  if (finishReason === 'stop') {
    if (choice.message.content){
      return choice.message.content
    }
  }


  const result = getFullResponse(
    [
      ...messages, 
      { role: "system", content: `you were cut off while saying the following, please continue from there: ${choice.message.content}` }, 
    ],
    choice.message.content ? [...pastResponses, choice.message.content] : pastResponses
  )

  return `${choice.message}${result}`
 

}


const parsePath = async (fullResponse: string): Promise<{ path: string, error: string }> => {
  const path = fullResponse.match(/show path: (.*)/)?.[1]

  if (!path) {
    return { path: '', error: 'No path provided' }
  }

  return { path, error: '' }
}

const checkDiff = async (diff: string): Promise<{ success: boolean, error: string }> => {
  const childProcess = exec(`git apply --check - `);
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
      return { success: false, error: stderr }
  }

  return { success: true, error: '' }
}