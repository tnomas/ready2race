import {forwardRef} from 'react'
import {CardActionArea, CardActionAreaProps} from '@mui/material'
import {createLink, LinkComponent} from '@tanstack/react-router'

const CardActionAreaAnchor = forwardRef<HTMLAnchorElement, CardActionAreaProps<'a'>>(
    (props, ref) => <CardActionArea ref={ref} component={'a'} {...props} />,
)

/**
 * Klickfläche einer Karte, die navigiert – ein `<a>` mit einem Tabstopp, typsicher gegen den
 * Routenbaum (wie `ButtonLink` aus `@components/ui`).
 */
export const CardActionAreaLink: LinkComponent<typeof CardActionAreaAnchor> =
    createLink(CardActionAreaAnchor)
