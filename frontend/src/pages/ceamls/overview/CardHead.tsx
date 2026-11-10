// CEAMLS: a card title with a control at the right. PatternFly's
// CardHeader moves the title to the right of where a plain CardTitle
// puts it, so the cards of one page did not line up. This row uses the
// classes of CardTitle, and so starts where the other titles start.
import * as React from 'react';

const CardHead: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="pf-v6-c-card__title ceamls-card-head">
    <h2 className="pf-v6-c-card__title-text">{title}</h2>
    {children}
  </div>
);

export default CardHead;
