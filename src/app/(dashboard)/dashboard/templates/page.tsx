import { BookTemplate, Lock } from "lucide-react";
import { getTemplates } from "@/app/actions/planning";
import { requireStaff } from "@/lib/roleGuard";

export const metadata = { title: "Planning Templates" };

export default async function TemplatesPage() {
  await requireStaff();

  const templatesRes = await getTemplates();
  const templates = templatesRes.success ? templatesRes.data : [];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Planning Templates</h1>
        <p className="text-body-md text-sc-gray mt-1">
          Reusable templates for common event types
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-12 text-center">
          <BookTemplate className="size-12 text-sc-gray-200 mx-auto mb-3" />
          <p className="text-sc-gray">No templates yet.</p>
          <p className="text-xs text-sc-gray-400 mt-1">System templates will appear here once configured.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {templates.map((t: any) => (
            <div
              key={t.id}
              className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 flex items-start gap-3"
            >
              <BookTemplate className="size-5 text-sc-teal shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sc-navy">{t.name}</p>
                  {t.is_system && (
                    <span className="flex items-center gap-0.5 text-xs text-sc-gray">
                      <Lock className="size-3" /> System
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-sc-gray mt-0.5">{t.description}</p>
                )}
                {t.category && (
                  <p className="text-xs text-sc-teal mt-1 capitalize">{t.category.replace(/_/g, " ")}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
