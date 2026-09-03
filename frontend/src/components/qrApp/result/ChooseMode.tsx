import {Button, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {ScanMode} from '@components/qrApp/appAccess.ts'

type Props = {
    options: ScanMode[]
    onChoose: (mode: ScanMode) => void
}

/** Die Nachfrage beim ersten Scan mit mehreren Rechten; die Antwort wird zum Stationsmodus. */
export const ChooseMode = ({options, onChoose}: Props) => {
    const {t} = useTranslation()
    return (
        <Stack spacing={2} sx={{width: 1}}>
            <Typography variant="h6" textAlign="center">
                {t('app.result.choose.title')}
            </Typography>
            {options.map(mode => (
                <Button
                    key={mode}
                    variant="contained"
                    size="large"
                    fullWidth
                    sx={{py: 2}}
                    onClick={() => onChoose(mode)}>
                    {t(`app.mode.${mode}`)}
                </Button>
            ))}
            <Typography variant="body2" color="text.secondary" textAlign="center">
                {t('app.result.choose.hint')}
            </Typography>
        </Stack>
    )
}
