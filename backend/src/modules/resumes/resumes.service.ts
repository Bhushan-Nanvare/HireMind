import { PDFParse } from "pdf-parse";
import fs from "fs";
import { prisma } from "../../shared/prisma";
import { generateEmbedding } from "../../shared/embeddings";

export async function uploadResume(userId: string, file: Express.Multer.File) {
  const candidate = await prisma.candidate.findUnique({ where: { userId } });
  if (!candidate) throw new Error("Candidate profile not found");

  const dataBuffer = fs.readFileSync(file.path);
  const parser = new PDFParse({ data: dataBuffer });
  const result = await parser.getText();
  const parsedText = result.text;
  await parser.destroy();

  const embedding = await generateEmbedding(parsedText);

  const resume = await prisma.resume.create({
    data: {
      candidateId: candidate.id,
      fileUrl: file.path,
      parsedText: parsedText,
      embedding,
    },
  });

  return resume;
}

export async function listMyResumes(userId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { userId } });
  if (!candidate) throw new Error("Candidate profile not found");

  return prisma.resume.findMany({ where: { candidateId: candidate.id } });
}