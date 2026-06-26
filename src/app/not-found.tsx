import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-sc-cream p-6">
      <div className="max-w-md w-full text-center">
        <p className="text-8xl font-serif font-bold text-sc-teal mb-4 leading-none">404</p>

        <h1 className="font-serif text-heading-1 text-sc-navy mb-3">
          Page not found
        </h1>
        <p className="text-body-md text-sc-gray mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Check the address and try again.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <Link href="/dashboard/home">Go to Dashboard</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/login">Back to Login</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
