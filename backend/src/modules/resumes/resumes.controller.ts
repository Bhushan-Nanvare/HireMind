import fs from "fs";
import { Response } from "express";
import { AuthRequest } from "../../shared/authMiddleware";
import { badRequest } from "../../shared/errors";
import { sendStoredFile } from "../../shared/files";
import { getParam } from "../../shared/http";
import * as resumeService from "./resumes.service";

export async function uploadHandler(req: AuthRequest, res: Response) {
  const file = req.file;
  if (!file) throw badRequest('No file uploaded. Send a PDF in the "resume" field.');

  try {
    const resume = await resumeService.uploadResume(req.user!.userId, file);
    res.status(201).json({ success: true, data: resume });
  } catch (err) {
    // Don't keep files from uploads that were rejected or failed
    await fs.promises.rm(file.path, { force: true });
    throw err;
  }
}

export async function listHandler(req: AuthRequest, res: Response) {
  const resumes = await resumeService.listMyResumes(req.user!.userId);
  res.json({ success: true, data: resumes });
}

export async function fileHandler(req: AuthRequest, res: Response) {
  const file = await resumeService.getResumeFile(req.user!.userId, getParam(req, "id"));
  await sendStoredFile(res, file.ref, { contentType: "application/pdf", fileName: file.fileName });
}

export async function deleteHandler(req: AuthRequest, res: Response) {
  await resumeService.deleteResume(req.user!.userId, getParam(req, "id"));
  res.json({ success: true });
}
