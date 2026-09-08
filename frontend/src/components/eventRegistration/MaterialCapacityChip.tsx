import {Chip} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {MaterialCapacityLevel} from '../../api'

/**
 * Die Ampel eines Angebots im Anmeldeformular: grün „verfügbar", gelb „knapp" - berechnet der
 * Anbieter aus geplanter Anzahl und bereits bestehenden Anfragen (siehe Backend), hier nur
 * angezeigt.
 */
export const MaterialCapacityChip = (props: {capacity: MaterialCapacityLevel}) => {
    const {t} = useTranslation()

    return (
        <Chip
            size="small"
            color={props.capacity === 'GREEN' ? 'success' : 'warning'}
            label={t(`material.registration.capacity.${props.capacity}`)}
        />
    )
}
