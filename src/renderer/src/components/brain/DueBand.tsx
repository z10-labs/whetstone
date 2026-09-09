import type { BrainItem } from '@shared/brain';
import { BrainCard } from './BrainCard';

interface Props {
  items: BrainItem[];
  now: number;
  onAdvance: (item: BrainItem) => void;
  onRename: (id: string, title: string) => void;
  onPin: (item: BrainItem) => void;
  onRemove: (id: string) => void;
  onSnooze: (item: BrainItem, minutes: number) => void;
}

const SNOOZES = [10, 60];

/**
 * What the clock has pushed into the room. Only rendered when something is
 * actually due — an empty alarm band that is always on screen stops being an
 * alarm, and the whole point of a reminder is that its arrival is an event.
 */
export function DueBand({ items, now, onAdvance, onRename, onPin, onRemove, onSnooze }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="due-band" aria-label="Due now">
      <header className="due-head">
        <span className="due-pulse" aria-hidden />
        <h2>Due now</h2>
        <span className="due-count">{items.length}</span>
      </header>
      <div className="due-list">
        {items.map((item) => (
          <BrainCard
            key={item.id}
            item={item}
            now={now}
            onAdvance={onAdvance}
            onRename={onRename}
            onPin={onPin}
            onRemove={onRemove}
          >
            {SNOOZES.map((minutes) => (
              <button
                key={minutes}
                className="snooze"
                onClick={() => onSnooze(item, minutes)}
                title={`Come back in ${minutes} minutes`}
              >
                +{minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
              </button>
            ))}
          </BrainCard>
        ))}
      </div>
    </section>
  );
}
