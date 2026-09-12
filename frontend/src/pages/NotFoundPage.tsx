import { Link } from "react-router-dom";
import { buttonPrimary } from "../components/common/styles";
import { useDocumentTitle } from "../utils/useDocumentTitle";

export default function NotFoundPage() {
  useDocumentTitle("Page not found");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <p className="text-sm font-medium text-slate-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">The page you're looking for doesn't exist or has moved.</p>
      <Link to="/" className={`${buttonPrimary} mt-6`}>
        Go to the home page
      </Link>
    </div>
  );
}
