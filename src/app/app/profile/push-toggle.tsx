"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { registerPushDevice, removePushDevice } from "./push-actions";

/**
 * Turning phone notifications on for this device.
 *
 * Per device, not per account: allowing them on a phone says nothing about a
 * laptop, and the browser holds the permission, so the switch has to read its
 * real state rather than something stored server-side. A row in the database
 * for a device whose permission was revoked in browser settings would show
 * "on" while nothing ever arrived.
 *
 * The permission is only ever requested from a tap. Asking on page load is
 * the pattern browsers now penalise, and a prompt nobody expected is one
 * people dismiss for good.
 */

type State = "loading" | "unsupported" | "denied" | "off" | "on" | "busy";

/** The VAPID key travels as base64url and the browser wants raw bytes. */
function decodeKey(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function read() {
      const supported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!supported || !publicKey) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const existing = await registration?.pushManager.getSubscription();
        if (cancelled) return;
        setEndpoint(existing?.endpoint ?? null);
        setState(existing ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    }

    void read();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function turnOn() {
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: a push must always show a notification,
        // never run silently in the background.
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey) as BufferSource,
      });

      const json = subscription.toJSON();
      const result = await registerPushDevice(
        {
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
        navigator.userAgent,
      );

      if (!result.ok) {
        await subscription.unsubscribe();
        setState("off");
        toast.error(result.error ?? "That did not work. Try again.");
        return;
      }

      setEndpoint(subscription.endpoint);
      setState("on");
      toast.success("Reminders on for this device.");
    } catch (error) {
      console.error("[push] subscribe failed", error);
      setState("off");
      toast.error("This device would not allow notifications.");
    }
  }

  async function turnOff() {
    setState("busy");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const target = subscription?.endpoint ?? endpoint;
      if (subscription) await subscription.unsubscribe();
      if (target) await removePushDevice(target);
      setEndpoint(null);
      setState("off");
      toast.success("Reminders off for this device.");
    } catch (error) {
      console.error("[push] unsubscribe failed", error);
      setState("on");
      toast.error("That did not work. Try again.");
    }
  }

  if (state === "loading") return null;

  if (state === "unsupported") {
    return (
      <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        This browser cannot show reminders. On an iPhone, add the site to your
        home screen first, then open it from there.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Notifications are blocked for this site. Allow them in your browser
        settings, then come back to this page.
      </p>
    );
  }

  const on = state === "on";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
      <div className="text-sm">
        <p className="font-medium">Remind me on this device</p>
        <p className="mt-0.5 text-muted-foreground">
          {on
            ? "On for this device. Each phone or computer is separate."
            : "A notification in the evening, only on days you have not filled in yet."}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-11 gap-2"
        disabled={state === "busy"}
        onClick={on ? turnOff : turnOn}
      >
        {on ? <BellOff className="size-4" /> : <BellRing className="size-4" />}
        {state === "busy" ? "Just a moment…" : on ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}
