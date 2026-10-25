import { Button } from "@kiftet/ui/components/button";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("pwa-install-dismissed") === "true") {
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShow(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show || !deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShow(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    sessionStorage.setItem("pwa-install-dismissed", "true");
  };

  return (
    <div className="fade-in slide-in-from-bottom-4 fixed right-3 bottom-20 left-3 z-50 mx-auto max-w-sm animate-in duration-300 sm:right-6 sm:bottom-6 sm:left-auto">
      <div className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-panel/95 p-3 shadow-[0_20px_60px_-30px_rgba(212,175,106,0.8)] backdrop-blur-xl">
        <img
          src="/logo-mark.png"
          alt=""
          className="size-10 rounded-xl bg-[#0A0B0D] ring-1 ring-gold/40"
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">Install Kiftet</p>
          <p className="text-muted-foreground text-xs">
            Add to home screen for faster access
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={handleInstall}>
            <Download className="size-3.5" />
            Install
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={handleDismiss}>
            ×
          </Button>
        </div>
      </div>
    </div>
  );
}
