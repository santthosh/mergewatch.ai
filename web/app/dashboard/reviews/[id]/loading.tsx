import { LoadingOverlay } from "@/components/Spinner";

export default function ReviewDetailLoading() {
  return (
    <div className="px-4 py-6 sm:px-6 sm:py-10">
      <LoadingOverlay label="Loading review..." />
    </div>
  );
}
