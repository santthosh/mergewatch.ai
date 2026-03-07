import { LoadingOverlay } from "@/components/Spinner";

export default function DashboardLoading() {
  return (
    <div className="px-4 py-6 sm:px-6 sm:py-10">
      <LoadingOverlay label="Loading dashboard..." />
    </div>
  );
}
