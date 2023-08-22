import { RetrievalQAChain, LLMChain, SequentialChain } from "langchain/chains";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { Document } from "langchain/document";
import { CSVLoader } from "langchain/document_loaders/fs/csv";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { OpenAI } from "langchain/llms/openai";
import { PromptTemplate } from "langchain/prompts";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

import { CHAT_MODELS, ChatAnswer } from "./models/chat";
import {
  maliciousPromptTemplate,
  promptInjectionEvalTemplate,
  qAcontextTemplate,
  retrievalQAPrePrompt,
} from "./promptTemplates";
import { PHASE_NAMES } from "./models/phase";

// chain we use in question/answer request
let qaChain: RetrievalQAChain | null = null;

// chain we use in prompt evaluation request
let promptEvaluationChain: SequentialChain | null = null;

function getFilepath(currentPhase: PHASE_NAMES = PHASE_NAMES.SANDBOX) {
  let filePath = "resources/documents/";
  switch (currentPhase) {
    case PHASE_NAMES.PHASE_0:
      return (filePath += "phase_0/");
    case PHASE_NAMES.PHASE_1:
      return (filePath += "phase_1/");
    case PHASE_NAMES.PHASE_2:
      return (filePath += "phase_2/");
    default:
      return (filePath += "common/");
  }
}

// load the documents from filesystem
async function getDocuments(filePath: string) {
  console.debug("Loading documents from: " + filePath);

  const loader: DirectoryLoader = new DirectoryLoader(filePath, {
    ".pdf": (path: string) => new PDFLoader(path),
    ".txt": (path: string) => new TextLoader(path),
    ".csv": (path: string) => new CSVLoader(path),
  });
  const docs = await loader.load();

  // split the documents into chunks
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 0,
  });
  const splitDocs = await textSplitter.splitDocuments(docs);
  return splitDocs;
}

// join the configurable preprompt to the context template
function getQAPromptTemplate(prePrompt: string) {
  if (!prePrompt) {
    console.debug("Using default retrieval QA pre-prompt");
    prePrompt = retrievalQAPrePrompt;
  }
  return PromptTemplate.fromTemplate(prePrompt + qAcontextTemplate);
}

// QA Chain - ask the chat model a question about the documents
async function initQAModel(
  apiKey: string,
  prePrompt: string,
  // default to sandbox
  currentPhase: PHASE_NAMES = PHASE_NAMES.SANDBOX
) {
  if (!apiKey) {
    console.debug("No apiKey set to initialise QA model");
    return;
  }
  // get the documents
  const docs: Document[] = await getDocuments(getFilepath(currentPhase));

  // embed and store the splits
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: apiKey,
  });
  const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);

  // initialise model
  const model = new ChatOpenAI({
    modelName: CHAT_MODELS.GPT_4,
    streaming: true,
    openAIApiKey: apiKey,
  });

  // prompt template for question and answering
  const qaPrompt = getQAPromptTemplate(prePrompt);

  // set chain to retrieval QA chain
  qaChain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever(), {
    prompt: qaPrompt,
  });
}

// initialise the prompt evaluation model
function initPromptEvaluationModel(apiKey: string) {
  if (!apiKey) {
    console.debug("No apiKey set to initialise prompt evaluation model");
    return;
  }

  // create chain to detect prompt injection
  const promptInjectionPrompt = PromptTemplate.fromTemplate(
    promptInjectionEvalTemplate
  );

  const promptInjectionChain = new LLMChain({
    llm: new OpenAI({
      modelName: CHAT_MODELS.GPT_3_5_TURBO,
      temperature: 0,
      openAIApiKey: apiKey,
    }),
    prompt: promptInjectionPrompt,
    outputKey: "promptInjectionEval",
  });

  // create chain to detect malicious prompts
  const maliciousInputPrompt = PromptTemplate.fromTemplate(
    maliciousPromptTemplate
  );
  const maliciousInputChain = new LLMChain({
    llm: new OpenAI({
      modelName: CHAT_MODELS.GPT_3_5_TURBO,
      temperature: 0,
      openAIApiKey: apiKey,
    }),
    prompt: maliciousInputPrompt,
    outputKey: "maliciousInputEval",
  });

  promptEvaluationChain = new SequentialChain({
    chains: [promptInjectionChain, maliciousInputChain],
    inputVariables: ["prompt"],
    outputVariables: ["promptInjectionEval", "maliciousInputEval"],
  });
  console.debug("Prompt evaluation chain initialised");
}

// ask the question and return models answer
async function queryDocuments(question: string) {
  if (!qaChain) {
    console.debug("QA chain not initialised.");
    return { reply: "", questionAnswered: false };
  }
  const response = await qaChain.call({
    query: question,
  });
  console.debug("QA model response: " + response.text);
  const result: ChatAnswer = {
    reply: response.text,
    questionAnswered: true,
  };
  return result;
}

// ask LLM whether the prompt is malicious
async function queryPromptEvaluationModel(input: string) {
  if (!promptEvaluationChain) {
    console.debug("Prompt evaluation chain not initialised.");
    return { isMalicious: false, reason: "" };
  }

  const response = await promptEvaluationChain.call({
    prompt: input,
  });

  const promptInjectionEval = formatEvaluationOutput(
    response.promptInjectionEval
  );
  const maliciousInputEval = formatEvaluationOutput(
    response.maliciousInputEval
  );

  console.debug(
    "Prompt injection eval: " + JSON.stringify(promptInjectionEval)
  );
  console.debug("Malicious input eval: " + JSON.stringify(maliciousInputEval));

  // if both are malicious, combine reason
  if (promptInjectionEval.isMalicious && maliciousInputEval.isMalicious) {
    return {
      isMalicious: true,
      reason: `${promptInjectionEval.reason} & ${maliciousInputEval.reason}`,
    };
  } else if (promptInjectionEval.isMalicious) {
    return { isMalicious: true, reason: promptInjectionEval.reason };
  } else if (maliciousInputEval.isMalicious) {
    return { isMalicious: true, reason: maliciousInputEval.reason };
  }
  return { isMalicious: false, reason: "" };
}

// format the evaluation model output. text should be a Yes or No answer followed by a reason
function formatEvaluationOutput(response: string) {
  try {
    // split response on first full stop or comma
    const splitResponse = response.split(/\.|,/);
    const answer = splitResponse[0]?.replace(/\W/g, "").toLowerCase();
    const reason = splitResponse[1];
    return {
      isMalicious: answer === "yes",
      reason: reason,
    };
  } catch (error) {
    // in case the model does not respond in the format we have asked
    console.error(error);
    console.debug(
      "Did not get a valid response from the prompt evaluation model. Original response: " +
        response
    );
    return { isMalicious: false, reason: "" };
  }
}

export {
  initQAModel,
  initPromptEvaluationModel,
  queryDocuments,
  queryPromptEvaluationModel,
};