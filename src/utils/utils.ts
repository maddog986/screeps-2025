export const partsCost = function (parts: BodyPartConstant[]): number {
    return parts.reduce((num, part) => num + BODYPART_COST[part], 0)
}
