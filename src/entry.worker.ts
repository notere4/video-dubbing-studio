import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { runJob, type Job } from "@/server/jobs";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401).
const app = everyApp<Env>(async (request) => tanstackEntry.fetch(request));

export default {
  ...app,
  // Transcription, translation and dubbing run here, one job per message.
  async queue(batch: MessageBatch<Job>) {
    for (const message of batch.messages) {
      await runJob(message.body);
      message.ack();
    }
  },
};
