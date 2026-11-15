import { ActionIcon, Text } from "@mantine/core";
import { useEffect } from "react";

export type PrototypeVariant = {
  key: string;
  name: string;
};

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: readonly PrototypeVariant[];
  current: string;
  onChange: (key: string) => void;
}) {
  const enabled = !import.meta.env.PROD;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const index = Math.max(
        0,
        variants.findIndex((variant) => variant.key === current),
      );
      const delta = event.key === "ArrowRight" ? 1 : -1;
      onChange(variants[(index + delta + variants.length) % variants.length].key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, enabled, onChange, variants]);

  if (!enabled) return null;

  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );
  const variant = variants[index] ?? variants[0];
  const move = (delta: number) => {
    onChange(variants[(index + delta + variants.length) % variants.length].key);
  };

  return (
    <div className="prototype-switcher" aria-label="Переключение вариантов прототипа">
      <ActionIcon
        variant="subtle"
        size="lg"
        radius="xl"
        aria-label="Предыдущий вариант"
        onClick={() => move(-1)}
      >
        ←
      </ActionIcon>
      <div className="prototype-switcher-label" aria-live="polite">
        <Text className="prototype-switcher-key">{variant.key.toUpperCase()} · прототип</Text>
        <Text className="prototype-switcher-name">{variant.name}</Text>
      </div>
      <ActionIcon
        variant="subtle"
        size="lg"
        radius="xl"
        aria-label="Следующий вариант"
        onClick={() => move(1)}
      >
        →
      </ActionIcon>
    </div>
  );
}
