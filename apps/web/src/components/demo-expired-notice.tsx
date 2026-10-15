import { Button } from "@kiftet/ui/components/button";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { restartDemo } from "@/lib/demo";

export function DemoExpiredNotice() {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const restart = async () => {
    setStarting(true);
    setError(null);
    try {
      await restartDemo();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("demo-start-error"));
      setStarting(false);
    }
  };

  return (
    <div
      role="alert"
      className="inner-surface mb-8 border border-gold/40 bg-gold/[0.06] p-4 text-sm"
    >
      <p className="font-medium text-gold">{t("demo-expired-title")}</p>
      <p className="mt-1 text-muted-foreground leading-6">
        {t("demo-expired-text")}
      </p>
      {error && <p className="mt-2 text-rust">{error}</p>}
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={starting}
        onClick={() => void restart()}
      >
        {starting ? t("loading") : t("demo-restart")}
      </Button>
    </div>
  );
}
