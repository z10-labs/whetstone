import type { ReactNode } from 'react';
import type { BrainItem } from '@shared/brain';
import type { BrainStore } from '../../state/useBrain';
import { prettyPath } from '../../lib/ui';
import { BrainCard } from './BrainCard';
import { CaptureBar } from './CaptureBar';
import { DueBand } from './DueBand';

interface Props {
  store: BrainStore;
}

/**
 * The Brain surface. Reads top to bottom as a question answered:
 * what just landed (Due), what I'm holding (In hand), what's waiting
 * (Outstanding), what I finished (Done) — with the margin rail keeping
 * armed reminders and loose jots in the corner of the eye.
 */
export function BrainPage({ store }: Props) {
  const { now } = store;

  const rename = (id: string, title: string) => void store.update({ id, title });
  const pin = (item: BrainItem) => void store.update({ id: item.id, pinned: !item.pinned });
  const remove = (id: string) => void store.remove(id);
  const advance = (item: BrainItem) => void store.advance(item);
  const snooze = (item: BrainItem, minutes: number) =>
    void store.update({ id: item.id, dueAt: Date.now() + minutes * 60_000 });

  const cardProps = {
    now,
    onAdvance: advance,
    onRename: rename,
    onPin: pin,
    onRemove: remove,
  };

  const nothingAtAll =
    store.due.length === 0 &&
    store.doing.length === 0 &&
    store.outstanding.length === 0 &&
    store.watching.length === 0 &&
    store.jots.length === 0 &&
    store.done.length === 0;

  return (
    <div className="brain-page">
      <header className="brain-head">
        <div className="brain-head-line">
          <h1>Brain</h1>
          <p className="brain-state">
            <Stat n={store.doing.length} label="in hand" tone="doing" />
            <Stat n={store.outstanding.length} label="outstanding" />
            <Stat n={store.watching.length} label="watching" />
            {store.due.length > 0 && <Stat n={store.due.length} label="due" tone="due" />}
          </p>
        </div>
        {store.mirrorPath && (
          <p className="brain-mirror" title={store.mirrorPath}>
            agents read <code>{prettyPath(store.mirrorPath)}</code>
          </p>
        )}
      </header>

      <CaptureBar onCapture={store.capture} />

      <div className="brain-body">
        <div className="brain-main">
          <DueBand items={store.due} onSnooze={snooze} {...cardProps} />

          {nothingAtAll ? (
            <FirstRun />
          ) : (
            <div className="lanes">
              <Lane
                title="In hand"
                blurb="What you are actually holding right now"
                items={store.doing}
                emptyNote="Nothing in progress. Start something from Outstanding."
                modifier="doing"
                {...cardProps}
              />
              <Lane
                title="Outstanding"
                blurb="Waiting for you"
                items={store.outstanding}
                emptyNote="Clear."
                modifier="open"
                {...cardProps}
              />
              <Lane
                title="Done"
                blurb="Last 7 days"
                items={store.done}
                emptyNote="Nothing finished yet."
                modifier="done"
                action={
                  store.done.length > 0 ? (
                    <button className="lane-clear" onClick={() => void store.clearFinished()}>
                      Clear
                    </button>
                  ) : null
                }
                {...cardProps}
              />
            </div>
          )}
        </div>

        <aside className="brain-rail" aria-label="Reminders and jots">
          <RailSection
            title="Watching"
            count={store.watching.length}
            empty="No reminders armed."
          >
            {store.watching.map((item) => (
              <BrainCard key={item.id} item={item} {...cardProps} />
            ))}
          </RailSection>

          <RailSection title="Jots" count={store.jots.length} empty="No loose notes.">
            {store.jots.map((item) => (
              <BrainCard key={item.id} item={item} {...cardProps} />
            ))}
          </RailSection>
        </aside>
      </div>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: 'doing' | 'due' }) {
  return (
    <span className={`brain-stat${tone ? ` is-${tone}` : ''}`}>
      <b>{n}</b> {label}
    </span>
  );
}

interface LaneProps {
  title: string;
  blurb: string;
  items: BrainItem[];
  emptyNote: string;
  modifier: string;
  action?: ReactNode;
  now: number;
  onAdvance: (item: BrainItem) => void;
  onRename: (id: string, title: string) => void;
  onPin: (item: BrainItem) => void;
  onRemove: (id: string) => void;
}

function Lane({ title, blurb, items, emptyNote, modifier, action, ...cardProps }: LaneProps) {
  return (
    <section className={`lane lane--${modifier}`}>
      <header className="lane-head">
        <h2>{title}</h2>
        <span className="lane-count">{items.length}</span>
        {action}
      </header>
      <p className="lane-blurb">{blurb}</p>
      <div className="lane-list">
        {items.length === 0 ? (
          <p className="lane-empty">{emptyNote}</p>
        ) : (
          items.map((item) => <BrainCard key={item.id} item={item} {...cardProps} />)
        )}
      </div>
    </section>
  );
}

function RailSection({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="rail-section">
      <header className="rail-head">
        <h2>{title}</h2>
        <span className="rail-count">{count}</span>
      </header>
      {count === 0 ? <p className="rail-empty">{empty}</p> : children}
    </section>
  );
}

function FirstRun() {
  return (
    <div className="brain-first">
      <p className="brain-first-lead">
        A spark, not a store. Entries here are short enough to read in a glance and
        precise enough to point you back at the work — the fire lives in your runs,
        your repo, and your head.
      </p>
      <dl className="brain-first-grid">
        <div>
          <dt>Jot</dt>
          <dd>A thought you do not want to carry. No status, no clock.</dd>
        </div>
        <div>
          <dt>Task</dt>
          <dd>Moves outstanding → in hand → done as you click its mark.</dd>
        </div>
        <div>
          <dt>Reminder</dt>
          <dd>Sits quiet until its time, then lands in Due with a notification.</dd>
        </div>
      </dl>
    </div>
  );
}
