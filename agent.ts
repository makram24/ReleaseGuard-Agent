import { LlmAgent , FunctionTool } from "@google/adk";
import { z } from "zod";

const tool = new FunctionTool({
    name: "get_current_time",
    description: "Get the current time",
    parameters: z.object({
        time: z.string(),
    }),
    execute: async ({ time }) => {
        return new Date(time).toISOString();
    },
});

const checkGitHub = new FunctionTool({
    name: "check_github",
    description: "Check the status of a GitHub for available repositories",
    parameters: z.object({
        pr_url: z.string().describe("The URL of the profile"),
    }),
    execute: async ({ pr_url }) => {
        const res = await fetch(pr_url);
        if (!res.ok) throw new Error(`GitHub repository request failed: ${res.status}`);
        const pr = await res.json();
        return pr;
    },
  });


export const agent = new LlmAgent({
    name: "Release_Guard",
    model: "gemini-3.1-flash-lite",
    description: "Looks up Repository Names from a GitHub profile",
    tools: [checkGitHub],
});