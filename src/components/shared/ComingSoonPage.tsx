import { Construction } from "lucide-react";

interface Props {
  title: string;
  description?: string;
}

export function ComingSoonPage({ title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sc-gold-50 border border-sc-gold-200">
        <Construction className="size-8 text-sc-gold-600" />
      </div>
      <h1 className="font-serif text-heading-1 text-sc-navy">{title}</h1>
      <p className="text-body-md text-sc-gray max-w-sm">
        {description ?? "This section is coming soon. We are building it now."}
      </p>
    </div>
  );
}
