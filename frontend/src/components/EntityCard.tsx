import {
    Box,
    Button,
    Card,
    CardActionArea,
    CardContent,
    IconButton,
    Menu,
    MenuItem,
    Stack,
    Typography,
} from '@mui/material'
import {
    GridColDef,
    GridValidRowModel,
    GridActionsCellItemProps,
    GridRenderCellParams,
} from '@mui/x-data-grid'
import {ExpandLess, ExpandMore, MoreVert} from '@mui/icons-material'
import React, {useState, ReactElement, ReactNode} from 'react'
import {useTranslation} from 'react-i18next'
import {MobileColumnMode} from '@utils/types.ts'
import {planCardFields} from '@utils/entityTable.ts'

export type EntityCardColumn<Entity extends GridValidRowModel> = GridColDef<Entity> & {
    mobile?: MobileColumnMode
}

type EntityCardProps<Entity extends GridValidRowModel> = {
    entity: Entity
    columns: EntityCardColumn<Entity>[]
    actions: ReactElement<GridActionsCellItemProps>[]
    onRowClick?: () => void
}

/** Zellwert wie im Grid: erst `valueGetter`, dann `renderCell` bzw. `valueFormatter`. */
const cellContent = <Entity extends GridValidRowModel>(
    entity: Entity,
    col: GridColDef<Entity>,
): ReactNode => {
    let value = entity[col.field]

    if (col.valueGetter) {
        // @ts-expect-error - valueGetter requires GridApi ref which we don't have in card view
        value = col.valueGetter(value, entity, col, {current: null})
    }

    if (col.renderCell) {
        const params = {
            value,
            row: entity,
            field: col.field,
            id: entity.id,
            tabIndex: 0,
            hasFocus: false,
            formattedValue: value,
            colDef: col,
            isEditable: false,
            cellMode: 'view' as const,
        } as GridRenderCellParams<Entity>
        return col.renderCell(params)
    }
    if (col.valueFormatter) {
        // @ts-expect-error - valueFormatter requires GridApi ref which we don't have in card view
        return col.valueFormatter(value, entity, col, {current: null})
    }
    return value
}

/**
 * Mobile Darstellung einer Tabellenzeile: Titelzeile, höchstens vier Felder in einem Raster,
 * der Rest hinter „Weitere Angaben". Klickbar (Maus, Enter, Leertaste), wenn die Zeile zu einer
 * Detailseite führt; das Aktionsmenü liegt daneben und nicht im klickbaren Bereich.
 */
const EntityCard = <Entity extends GridValidRowModel>({
    entity,
    columns,
    actions,
    onRowClick,
}: EntityCardProps<Entity>) => {
    const {t} = useTranslation()
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
    const [expanded, setExpanded] = useState(false)
    const open = Boolean(anchorEl)

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        setAnchorEl(event.currentTarget)
    }

    const handleMenuClose = () => {
        setAnchorEl(null)
    }

    const handleActionClick =
        (action: ReactElement<GridActionsCellItemProps>) =>
        (event: React.MouseEvent<HTMLButtonElement | HTMLLIElement>) => {
            handleMenuClose()
            if (action.props.onClick) {
                action.props.onClick(
                    event as React.MouseEvent<HTMLButtonElement> & React.MouseEvent<HTMLLIElement>,
                )
            }
        }

    const plan = planCardFields(columns)
    const fields = expanded ? [...plan.visible, ...plan.more] : plan.visible

    const content = (
        <CardContent sx={{'&:last-child': {pb: 2}}}>
            {plan.title && (
                <Box sx={{mb: fields.length > 0 ? 1.5 : 0, minWidth: 0}}>
                    {plan.title.headerName && (
                        <Typography
                            variant={'caption'}
                            color={'text.secondary'}
                            sx={{display: 'block', fontWeight: 500}}>
                            {plan.title.headerName}
                        </Typography>
                    )}
                    <Typography
                        variant={'subtitle1'}
                        component={'div'}
                        sx={{fontWeight: 600, overflowWrap: 'anywhere'}}>
                        {cellContent(entity, plan.title)}
                    </Typography>
                </Box>
            )}
            {fields.length > 0 && (
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        columnGap: 2,
                        rowGap: 1.5,
                    }}>
                    {fields.map(col => (
                        <Box key={col.field} sx={{minWidth: 0}}>
                            <Typography
                                variant={'caption'}
                                color={'text.secondary'}
                                sx={{fontWeight: 500, display: 'block'}}>
                                {col.headerName}
                            </Typography>
                            <Typography
                                variant={'body2'}
                                component={'div'}
                                sx={{overflowWrap: 'anywhere'}}>
                                {cellContent(entity, col)}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            )}
        </CardContent>
    )

    return (
        <Card sx={{position: 'relative'}}>
            <Box sx={{display: 'flex', alignItems: 'flex-start'}}>
                {onRowClick ? (
                    // `div` statt `button`: Zellen dürfen eigene Links und Knöpfe enthalten.
                    <CardActionArea
                        component={'div'}
                        onClick={onRowClick}
                        sx={{flex: 1, minWidth: 0, cursor: 'pointer'}}>
                        {content}
                    </CardActionArea>
                ) : (
                    <Box sx={{flex: 1, minWidth: 0}}>{content}</Box>
                )}
                {actions.length > 0 && (
                    <Box sx={{p: 1, flexShrink: 0}}>
                        <IconButton
                            size={'small'}
                            aria-label={t('common.actions')}
                            aria-haspopup={'menu'}
                            aria-expanded={open}
                            onClick={handleMenuOpen}
                            sx={{cursor: 'pointer'}}>
                            <MoreVert />
                        </IconButton>
                        <Menu
                            anchorEl={anchorEl}
                            open={open}
                            onClose={handleMenuClose}
                            anchorOrigin={{
                                vertical: 'bottom',
                                horizontal: 'right',
                            }}
                            transformOrigin={{
                                vertical: 'top',
                                horizontal: 'right',
                            }}>
                            {actions.map((action, index) => (
                                <MenuItem
                                    key={index}
                                    onClick={handleActionClick(action)}
                                    disabled={action.props.disabled}
                                    sx={{cursor: 'pointer'}}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        {action.props.icon}
                                        <Typography>{action.props.label}</Typography>
                                    </Stack>
                                </MenuItem>
                            ))}
                        </Menu>
                    </Box>
                )}
            </Box>
            {plan.more.length > 0 && (
                <Box sx={{px: 1, pb: 1}}>
                    <Button
                        size={'small'}
                        onClick={() => setExpanded(e => !e)}
                        aria-expanded={expanded}
                        endIcon={expanded ? <ExpandLess /> : <ExpandMore />}
                        sx={{cursor: 'pointer'}}>
                        {expanded
                            ? t('entity.card.less')
                            : t('entity.card.more', {count: plan.more.length})}
                    </Button>
                </Box>
            )}
        </Card>
    )
}

export default EntityCard
