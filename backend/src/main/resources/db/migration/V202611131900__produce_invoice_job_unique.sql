-- Ein Rechnungsjob je Meldung und Rechnungsart. Bisher schützte nur der Schalter
-- event.invoices_produced (nicht atomar gelesen) vor Doppelaufträgen; zwei gleichzeitige
-- Aufrufe legten je Meldung zwei Jobs an, also zwei Rechnungen mit zwei Mails.
--
-- Altbestand: Jobs werden nach erfolgreicher Erzeugung gelöscht, offen sind nur noch nicht
-- abgearbeitete oder gescheiterte. Sollten darunter Dubletten sein, bleibt je
-- (event_registration, mode) der älteste Job stehen (bei Gleichstand die kleinste id); die
-- übrigen hätten nur eine zweite Rechnung derselben Art erzeugt.
delete
from produce_invoice_for_registration p
using produce_invoice_for_registration keep
where keep.event_registration = p.event_registration
  and keep.mode = p.mode
  and (keep.created_at, keep.id) < (p.created_at, p.id);

create unique index produce_invoice_for_registration_registration_mode_unique
    on produce_invoice_for_registration (event_registration, mode);
