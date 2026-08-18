import type { SpecFile } from '@shared/explain-pr';
import { displayPath } from './fileName';

interface Props {
  files: SpecFile[];
  mapping: boolean;
}

export function PendingFilesPanel({ files, mapping }: Props) {
  if (files.length === 0) return null;

  return (
    <section className="pending-panel" aria-label="Files still being organized">
      <div className="pending-panel-head">
        {mapping && <span className="spark" />}
        <div>
          <strong>
            {mapping ? 'Still organizing' : 'Not yet explained'}
            {' · '}
            {files.length} file{files.length === 1 ? '' : 's'}
          </strong>
          <p>
            {mapping
              ? 'Claude is placing these into goals. Each one becomes a card when its explainer lands.'
              : 'These files never got an explainer. The rest of the map is ready to review.'}
          </p>
        </div>
      </div>
      <ul className="pending-panel-list">
        {files.map((file) => (
          <li key={file.id} title={file.path}>
            <span className={`file-kind file-kind--${file.changeType}`} />
            <code>{displayPath(file.path)}</code>
            <span className="pending-stat">
              +{file.additions}
              {file.deletions > 0 ? ` −${file.deletions}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
