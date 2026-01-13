import { useEffect } from "react";
import { useRealtime as useRealtimeUtil } from "@/lib/realtime";

export const useRealtime = () => {
  const realtime = useRealtimeUtil();

  useEffect(() => {
    // Realtime subscriptions will be set up here as features are built
    return () => {
      // Cleanup
    };
  }, []);

  return realtime;
};

