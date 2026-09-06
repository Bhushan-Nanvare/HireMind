import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { uploadResume, listMyResumes } from "../../api/resumeApi";
import Navbar from "../../components/common/Navbar";

interface Resume {
  id: string;
  parsedText: string | null;
}

export default function DashboardPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadResumes(); }, []);

  async function loadResumes() {
    try {
      setResumes(await listMyResumes());
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to load resumes");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await uploadResume(file);
      await loadResumes();
    } catch (err: any) {
      setError(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-2xl mx-auto p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Your resumes</h1>
          <div className="flex items-center gap-4">
            <Link to="/candidate/applications" className="text-sm text-slate-600 hover:text-slate-900">
              My applications →
            </Link>
            <Link to="/candidate/jobs" className="text-sm text-slate-600 hover:text-slate-900">
              Browse jobs →
            </Link>
          </div>
        </div>

        <label className="block border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-slate-400 mb-8">
          <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} disabled={uploading} />
          <p className="text-sm text-slate-600">
            {uploading ? "Uploading and parsing..." : "Click to upload a PDF resume"}
          </p>
        </label>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <div className="space-y-3">
          {resumes.length === 0 && <p className="text-sm text-slate-400">No resumes uploaded yet.</p>}
          {resumes.map((r) => (
            <div key={r.id} className="bg-white p-4 rounded border">
              <p className="text-sm font-medium text-slate-900">Resume {r.id.slice(0, 8)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {r.parsedText ? r.parsedText.slice(0, 150) + "..." : "Parsing..."}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}