import { useEffect, useState } from "react";

import { getFeatured, type ResultSet } from "./api";
import ChatPanel, { type EntryFocus } from "./components/ChatPanel";
import Header from "./components/Header";
import Landing from "./components/Landing";
import ProductDrawer from "./components/ProductDrawer";
import ResultsPanel, { ResultsPlaceholder } from "./components/ResultsPanel";
import ResultsStrip from "./components/ResultsStrip";
import { Banners, SkeletonPanel, SkeletonStrip } from "./components/States";
import { hasStoredSession, useChat } from "./useChat";

export default function App() {
  const chat = useChat();
  const { started, ready, messages, resultSets, selectedResultSet, enteringResultSet, turnRunning, loadingResults } = chat.state;
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  // Featured products fill the results until the conversation has its own: undefined while loading, null if it failed.
  const [featured, setFeatured] = useState<ResultSet | null>();
  useEffect(() => {
    getFeatured().then(setFeatured, () => setFeatured(null));
  }, []);
  // Where focus goes when a send from the landing brings in the chat (docs/06-frontend.md, Loading, empty and error states).
  const [entryFocus, setEntryFocus] = useState<EntryFocus>(null);
  // The featured cards play the entrance only on the landing's first showing, not when a new chat brings it back.
  const [landingShown, setLandingShown] = useState(false);

  // While a stored session is restored, the main area stays empty, so neither the landing nor a layout flashes first.
  // A first visit has nothing to restore, so its landing shows at once, inactive until the session exists.
  const [restoring] = useState(hasStoredSession);
  const landing = (started || !restoring) && messages.length === 0;
  const conversation = started && messages.length > 0;
  useEffect(() => {
    if (conversation) setLandingShown(true);
  }, [conversation]);

  const resultSet = selectedResultSet === null ? null : resultSets[selectedResultSet];
  const shown = resultSet ?? featured ?? null;
  const loading = loadingResults || (!resultSet && featured === undefined);
  const results = shown && {
    resultSet: shown,
    onOpenProduct: setOpenProduct,
    onSuggestion: chat.send,
    turnRunning,
    animate: resultSet !== null && selectedResultSet === enteringResultSet, // leaving the landing replays nothing
  };

  const sendFromLanding = (text: string, fromComposer: boolean) => {
    setEntryFocus(fromComposer ? "composer" : "list");
    chat.send(text);
  };

  return (
    <div className="h-dvh">
      {/* Shell: 56 px header, the banner row and the main area, centered at 1680 px; only the panels scroll. */}
      <div className="mx-auto grid h-full max-w-[1680px] grid-rows-[56px_auto_minmax(0,1fr)] bg-surface-muted min-[1680px]:border-x min-[1680px]:border-line">
        <Header onNewChat={chat.newChat} />
        <Banners notice={chat.state.notice} onDismiss={chat.dismissNotice} />
        <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[clamp(340px,32vw,460px)_minmax(0,1fr)] lg:grid-rows-1">
          {landing && (
            <div className="row-span-full min-h-0 min-w-0 lg:col-span-full">
              <Landing
                draft={chat.state.draft}
                onDraftChange={chat.setDraft}
                onSend={sendFromLanding}
                canSend={ready && !turnRunning}
                featured={featured}
                animateFeatured={!landingShown}
                onOpenProduct={setOpenProduct}
              />
            </div>
          )}
          {conversation && (
            <>
              {/* Wide: chat beside results. Narrow: results strip above the chat. */}
              <section aria-label="Chat" className="chat-panel flex min-h-0 min-w-0 flex-col bg-panel text-panel-fg">
                <ChatPanel chat={chat} entryFocus={entryFocus} />
              </section>
              <section aria-label="Results" className="order-first min-h-0 min-w-0 bg-surface-muted lg:order-none">
                {/* CSS picks the layout, so resizing never re-mounts or loses state. */}
                <div className="hidden h-full overflow-hidden lg:block">
                  {loading ? <SkeletonPanel /> : results ? <ResultsPanel {...results} /> : <ResultsPlaceholder />}
                </div>
                {(loading || results) && (
                  <div className="border-b border-line lg:hidden">{loading ? <SkeletonStrip /> : results && <ResultsStrip {...results} />}</div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
      {openProduct && <ProductDrawer key={openProduct} productId={openProduct} onClose={() => setOpenProduct(null)} />}
    </div>
  );
}
