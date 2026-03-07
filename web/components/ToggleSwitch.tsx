"use client";

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export default function ToggleSwitch({ checked, disabled, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative w-11 h-6 shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-[#00ff88]" : "bg-[#2a2a2a]",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-black transition-transform duration-200",
          checked ? "translate-x-5" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </button>
  );
}
