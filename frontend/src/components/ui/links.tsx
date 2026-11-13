import {forwardRef} from 'react'
import {
    Button,
    ButtonProps,
    IconButton,
    IconButtonProps,
    Link as MuiLink,
    LinkProps as MuiLinkProps,
    ListItemButton,
    ListItemButtonProps,
} from '@mui/material'
import {createLink, LinkComponent} from '@tanstack/react-router'

// Router-Links, die direkt als MUI-Bedienelement rendern: EIN <a>-Element mit EINEM Tabstopp,
// statt <Link><Button/></Link> (zwei Tabstopps, ungültiges HTML). Props = MUI-Props des
// Elements + Router-Props (`to`, `params`, `search`, `hash`, `target` …), typsicher gegen den
// Routenbaum. Aktiver Zustand: Router setzt `data-status="active"` bzw. `activeProps`.

const ButtonAnchor = forwardRef<HTMLAnchorElement, ButtonProps<'a'>>((props, ref) => (
    <Button ref={ref} component={'a'} {...props} />
))
const CreatedButtonLink = createLink(ButtonAnchor)

/**
 * Knopf, der navigiert.
 *
 * @example
 * <ButtonLink to={'/event/$eventId'} params={{eventId}} variant={'contained'}>
 *     {t('common.open')}
 * </ButtonLink>
 */
export const ButtonLink: LinkComponent<typeof ButtonAnchor> = props => (
    <CreatedButtonLink {...props} />
)

type IconButtonAnchorProps = IconButtonProps<'a'> & {
    /** Pflicht: Icon-Knöpfe haben sonst keinen zugänglichen Namen. */
    'aria-label': string
}

const IconButtonAnchor = forwardRef<HTMLAnchorElement, IconButtonAnchorProps>((props, ref) => (
    <IconButton ref={ref} component={'a'} {...props} />
))
const CreatedIconButtonLink = createLink(IconButtonAnchor)

/**
 * Icon-Knopf, der navigiert. `aria-label` ist Pflicht.
 *
 * @example
 * <IconButtonLink to={'/event'} aria-label={t('common.back')}><ArrowBack /></IconButtonLink>
 */
export const IconButtonLink: LinkComponent<typeof IconButtonAnchor> = props => (
    <CreatedIconButtonLink {...props} />
)

const ListItemButtonAnchor = forwardRef<HTMLAnchorElement, ListItemButtonProps<'a'>>(
    (props, ref) => <ListItemButton ref={ref} component={'a'} {...props} />,
)
const CreatedListItemButtonLink = createLink(ListItemButtonAnchor)

/**
 * Listeneintrag, der navigiert (Seitenleiste, Auswahllisten). `selected` setzt der Aufrufer,
 * z. B. aus `useMatchRoute`.
 *
 * @example
 * <ListItemButtonLink to={'/club'} selected={isActive}>
 *     <ListItemIcon><Groups /></ListItemIcon>
 *     <ListItemText primary={t('club.clubs')} />
 * </ListItemButtonLink>
 */
export const ListItemButtonLink: LinkComponent<typeof ListItemButtonAnchor> = props => (
    <CreatedListItemButtonLink {...props} />
)

const TextAnchor = forwardRef<HTMLAnchorElement, MuiLinkProps>((props, ref) => (
    <MuiLink ref={ref} {...props} />
))
const CreatedTextLink = createLink(TextAnchor)

/**
 * Textlink im Fließtext und in Breadcrumbs – sichtbar als Link (Primär-Lesefarbe, Unterstreichung
 * beim Überfahren), anders als das nackte Router-`Link`, das die globale CSS entfärbt.
 *
 * @example
 * <TextLink to={'/club/$clubId'} params={{clubId}}>{club.name}</TextLink>
 */
export const TextLink: LinkComponent<typeof TextAnchor> = props => <CreatedTextLink {...props} />
