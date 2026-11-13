import {Button, ButtonProps, CircularProgress} from '@mui/material'
import {PropsWithChildren} from 'react'

type Props = ButtonProps & {
    pending: boolean
}

/**
 * Knopf mit Ladezustand: Während `pending` bleibt die Beschriftung unsichtbar im Layout stehen
 * (die Breite springt nicht), ein Spinner liegt mittig darüber, und der Knopf ist gesperrt –
 * ein zweiter Klick geht ins Leere.
 */
//todo: KERN: progress not for really short timespan?
const LoadingButton = ({children, pending, sx, ...props}: PropsWithChildren<Props>) => {
    return (
        <Button
            {...props}
            disabled={pending || props.disabled}
            aria-busy={pending || undefined}
            sx={{
                display: 'flex',
                position: 'relative',
                ...(pending && {
                    '& .MuiButton-startIcon, & .MuiButton-endIcon': {visibility: 'hidden'},
                }),
                ...sx,
            }}>
            <span style={pending ? {visibility: 'hidden'} : undefined}>{children}</span>
            {pending && (
                <CircularProgress
                    size={18}
                    color={'inherit'}
                    aria-hidden
                    sx={{position: 'absolute', top: '50%', left: '50%', mt: '-9px', ml: '-9px'}}
                />
            )}
        </Button>
    )
}

export default LoadingButton
