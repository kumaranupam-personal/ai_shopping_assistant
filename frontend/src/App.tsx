import { useEffect, useState } from "react";

import { getFeatured, type ResultSet } from "./api";
import ChatPanel from "./components/ChatPanel";
import Header from "./components/Header";
import ProductDrawer from "./components/ProductDrawer";
import ResultsPanel from "./components/ResultsPanel";
import ResultsStrip from "./components/ResultsStrip";
import { Banners, EmptyState, SkeletonCards } from "./components/States";
import { useChat } from "./useChat";

export default function App() {
  const chat = useChat();
  const { started, resultSets, selectedResultSet, enteringResultSet, turnRunning, loadingResults } = chat.state;
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  // Featured products fill the results until the conversation has its own: undefined while loading, null if it failed.
  const [featured, setFeatured] = useState<ResultSet | null>();
  useEffect(() => {
    getFeatured().then(setFeatured, () => setFeatured(null));
  }, []);
  // The featured cards play the entrance only on their first appearance, not when a new chat brings them back.
  const [featuredFirstShowing, setFeaturedFirstShowing] = useState(true);

  const resultSet = selectedResultSet === null ? null : resultSets[selectedResultSet];
  useEffect(() => {
    if (resultSet) setFeaturedFirstShowing(false);
  }, [resultSet]);
  // Until the session is restored, it's unknown whether the conversation has results, so nothing flashes first.
  const welcome = started && !resultSet;
  const shown = resultSet ?? (welcome ? featured : null);
  const loading = loadingResults || !started || (welcome && featured === undefined);
  const intro = welcome && <EmptyState className="px-6 pt-10 pb-6" />; // the wide panel's heading before any results
  const results = shown && {
    resultSet: shown,
    onOpenProduct: setOpenProduct,
    onSuggestion: chat.send,
    turnRunning,
    featured: !resultSet,
    animate: resultSet ? selectedResultSet === enteringResultSet : featuredFirstShowing,
  };
  return (
    <div className="h-dvh">
      {/* Shell: 56 px header over the main area, centered at 1680 px; only the panels scroll. */}
      <div className="mx-auto grid h-full max-w-[1680px] grid-rows-[56px_auto_minmax(0,1fr)] bg-surface min-[1680px]:border-x min-[1680px]:border-line">
        <Header onNewChat={chat.newChat} />
        <Banners notice={chat.state.notice} onDismiss={chat.dismissNotice} />
        {/* Wide: chat beside results. Narrow: results strip above the chat. */}
        <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[clamp(340px,32vw,460px)_minmax(0,1fr)] lg:grid-rows-1">
          <section aria-label="Chat" className="flex min-h-0 min-w-0 flex-col lg:border-r lg:border-line">
            <ChatPanel chat={chat} />
          </section>
          <section aria-label="Results" className="order-first min-h-0 min-w-0 bg-surface-muted lg:order-none">
            {/* CSS picks the layout, so resizing never re-mounts or loses state. */}
            <div className="hidden h-full overflow-hidden lg:block">
              {loading ? (
                <>
                  {intro}
                  <SkeletonCards />
                </>
              ) : results ? (
                <ResultsPanel {...results} intro={intro} />
              ) : (
                intro
              )}
            </div>
            <div className="lg:hidden">{loading ? <SkeletonCards compact /> : results && <ResultsStrip {...results} />}</div>
          </section>
        </main>
      </div>
      {openProduct && <ProductDrawer key={openProduct} productId={openProduct} onClose={() => setOpenProduct(null)} />}
    </div>
  );
}
