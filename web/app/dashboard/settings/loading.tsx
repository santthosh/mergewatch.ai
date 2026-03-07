import { LoadingOverlay } from "@/components/Spinner";

export default function SettingsLoading() {
  return (
    <div className="px-4 py-6 sm:px-6 sm:py-10">
      <LoadingOverlay label="Loading settings..." />
    </div>
  );
}
