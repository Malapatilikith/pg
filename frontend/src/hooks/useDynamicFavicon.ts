import { useEffect } from "react";
import { useAuth } from "./useAuth";

export const useDynamicFavicon = () => {
  const { activePg } = useAuth();

  useEffect(() => {
    const link: HTMLLinkElement = document.querySelector("link[rel*='icon']") || document.createElement("link");
    
    link.type = "image/png";
    link.rel = "icon";

    if (activePg?.logoUrl) {
      link.href = activePg.logoUrl;
    } else {
      link.href = "/favicon.ico"; // Fallback to default
    }

    document.getElementsByTagName("head")[0].appendChild(link);
  }, [activePg?.logoUrl]);
};
