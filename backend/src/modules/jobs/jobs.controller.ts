import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../../shared/authMiddleware";
import { getParam } from "../../shared/http";
import * as jobsService from "./jobs.service";

const jobSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(10_000),
});
const statusSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

export async function createHandler(req: AuthRequest, res: Response) {
  const { title, description } = jobSchema.parse(req.body);
  const job = await jobsService.createJob(req.user!.userId, title, description);
  res.status(201).json({ success: true, data: job });
}

export async function listMineHandler(req: AuthRequest, res: Response) {
  const jobs = await jobsService.listMyJobs(req.user!.userId);
  res.json({ success: true, data: jobs });
}

export async function listAllHandler(_req: AuthRequest, res: Response) {
  const jobs = await jobsService.listAllOpenJobs();
  res.json({ success: true, data: jobs });
}

export async function getOneHandler(req: AuthRequest, res: Response) {
  const job = await jobsService.getJobById(getParam(req, "id"));
  res.json({ success: true, data: job });
}

export async function updateHandler(req: AuthRequest, res: Response) {
  const { title, description } = jobSchema.parse(req.body);
  const job = await jobsService.updateJob(req.user!.userId, getParam(req, "id"), title, description);
  res.json({ success: true, data: job });
}

export async function statusHandler(req: AuthRequest, res: Response) {
  const { status } = statusSchema.parse(req.body);
  const job = await jobsService.setJobStatus(req.user!.userId, getParam(req, "id"), status);
  res.json({ success: true, data: job });
}

export async function deleteHandler(req: AuthRequest, res: Response) {
  await jobsService.deleteJob(req.user!.userId, getParam(req, "id"));
  res.json({ success: true });
}
