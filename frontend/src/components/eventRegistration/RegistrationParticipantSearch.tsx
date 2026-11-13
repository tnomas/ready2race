import {
    FormControlLabel,
    IconButton,
    InputAdornment,
    Stack,
    Switch,
    TextField,
    Typography,
} from '@mui/material'
import {Clear, Search} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'

/** Suchfeld über der Personenliste (Teilnehmende und Einzelwettkämpfe). */
export const RegistrationParticipantSearch = (props: {
    query: string
    onQueryChange: (query: string) => void
    shown: number
    total: number
    onlyRegistered?: boolean
    onOnlyRegisteredChange?: (only: boolean) => void
}) => {
    const {t} = useTranslation()
    return (
        <Stack
            direction={{xs: 'column', sm: 'row'}}
            spacing={{xs: 1, sm: 2}}
            alignItems={{xs: 'stretch', sm: 'center'}}>
            <TextField
                size={'small'}
                value={props.query}
                onChange={e => props.onQueryChange(e.target.value)}
                placeholder={t('event.registration.search.placeholder')}
                inputProps={{'aria-label': t('event.registration.search.placeholder')}}
                sx={{flex: {sm: '1 1 18rem'}, maxWidth: {sm: '26rem'}}}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position={'start'}>
                            <Search fontSize={'small'} />
                        </InputAdornment>
                    ),
                    endAdornment: props.query ? (
                        <InputAdornment position={'end'}>
                            <IconButton
                                size={'small'}
                                aria-label={t('entity.search.clear')}
                                sx={{cursor: 'pointer'}}
                                onClick={() => props.onQueryChange('')}>
                                <Clear fontSize={'small'} />
                            </IconButton>
                        </InputAdornment>
                    ) : undefined,
                }}
            />
            {props.onOnlyRegisteredChange && (
                <FormControlLabel
                    sx={{cursor: 'pointer', mr: 0}}
                    control={
                        <Switch
                            checked={props.onlyRegistered ?? false}
                            onChange={(_, checked) => props.onOnlyRegisteredChange?.(checked)}
                        />
                    }
                    label={t('event.registration.search.onlyRegistered')}
                />
            )}
            <Typography
                variant={'body2'}
                color={'text.secondary'}
                aria-live={'polite'}
                sx={{whiteSpace: 'nowrap'}}>
                {t('event.registration.search.count', {shown: props.shown, total: props.total})}
            </Typography>
        </Stack>
    )
}
