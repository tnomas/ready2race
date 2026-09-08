import {Box, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'

/**
 * Platzhalter für die Veranstaltungsauswahl eines Materialanbieters — die eigentliche Liste
 * (Veranstaltungen, zu denen der Anbieter eingeladen ist) kommt erst mit Aufgabe 2.3.
 */
const SelectMaterialEventPage = () => {
    const {t} = useTranslation()

    return (
        <Box>
            <Typography variant={'h1'}>{t('material.events.title')}</Typography>
            <Typography>{t('material.events.none')}</Typography>
        </Box>
    )
}

export default SelectMaterialEventPage
