
"use strict";

(() => {
  const SUPABASE_URL = "https://ihhbkpponnvdarxslzoe.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_mR2bpKOHR1AI4dHei1-jaA_9lgVcRuL";

  const sdk = window.supabase;

  window.supabaseClient = null;
  window.supabaseReady = false;
  window.supabaseConnectionError = "";

  if (!sdk || typeof sdk.createClient !== "function") {
    window.supabaseConnectionError =
      "Supabase library failed to load. Check your internet connection.";
    console.error(window.supabaseConnectionError);
    return;
  }

  try {
    window.supabaseClient = sdk.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        },
        global: {
          headers: {
            "X-Client-Info": "prince-paan-customer-web"
          }
        }
      }
    );

    window.supabaseReady = true;
  } catch (error) {
    window.supabaseConnectionError =
      error?.message || "Could not initialize Supabase.";
    console.error("Supabase initialization failed:", error);
  }
})();
