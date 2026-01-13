import { createClientSupabase } from "./supabase";

export const useRealtime = () => {
  const supabase = createClientSupabase();

  const subscribeToJobs = (callback: (payload: any) => void) => {
    const channel = supabase
      .channel("jobs-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
        },
        callback
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToSchedule = (callback: (payload: any) => void) => {
    const channel = supabase
      .channel("schedule-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assignments",
        },
        callback
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToAnnouncements = (callback: (payload: any) => void) => {
    const channel = supabase
      .channel("announcements-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcements",
        },
        callback
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToStock = (callback: (payload: any) => void) => {
    const channel = supabase
      .channel("stock-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stock_movements",
        },
        callback
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  return {
    subscribeToJobs,
    subscribeToSchedule,
    subscribeToAnnouncements,
    subscribeToStock,
  };
};

