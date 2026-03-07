"use client";

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export default function ToggleSwitch({ checked, disabled, onChange }: ToggleSwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative shrink-0 w-9 h-5 rounded-full transition-colors duration-150",
        checked ? "bg-[#00ff88]" : "bg-[#2a2a2a]",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 w-4 h-4 rounded-full bg-black transition-transform duration-150",
          checked ? "translate-x-4" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}
