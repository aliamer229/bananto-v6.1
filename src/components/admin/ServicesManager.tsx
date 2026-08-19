import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ProductRequestsView from "./services/ProductRequestsView";
import DiscTradesAdminView from "./services/DiscTradesAdminView";
import TradeLibraryManager from "./services/TradeLibraryManager";
import ContentSettingsWrapper from "./services/ContentSettingsWrapper";

export default function ServicesManager({ activeSubMenu }: { activeSubMenu: string }) {
  if (activeSubMenu === "services_requests") {
    return <ProductRequestsView />;
  }
  if (activeSubMenu === "services_disc_trades") {
    return <DiscTradesAdminView />;
  }
  if (activeSubMenu === "services_trade_library") {
    return <TradeLibraryManager />;
  }
  if (
    ["services_faq", "services_policy", "services_support", "services_guides"].includes(
      activeSubMenu,
    )
  ) {
    return <ContentSettingsWrapper type={activeSubMenu} />;
  }
  return (
    <div className="p-8 text-center text-muted-foreground animate-in fade-in">
      اختر من القائمة الجانبية لإدارة خدمات وإرشادات المتجر
    </div>
  );
}
