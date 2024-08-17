/**
 * This version does not ensure optimal solution but more cpu efficient
 */

import { Coord } from './types';

let movementMap: Map<number, Creep>;
let visitedCreeps: { [creepName: string]: boolean };

export const trafficManager = {
    /**
     * needs to be outside of loop
     */
    init() {
        Creep.prototype.registerMove = function (target: DirectionConstant | RoomPosition | Coord) {
            let targetPosition;

            if (Number.isInteger(target)) {
                const deltaCoords = directionDelta[<DirectionConstant>target];
                targetPosition = {
                    x: Math.max(0, Math.min(49, this.pos.x + deltaCoords.x)),
                    y: Math.max(0, Math.min(49, this.pos.y + deltaCoords.y)),
                };
            } else {
                targetPosition = target;
            }

            this._intendedCoordX = targetPosition.x;
            this._intendedCoordY = targetPosition.y;
        };

        Creep.prototype.setWorkingArea = function (pos: RoomPosition, range: number) {
            this._workingPos = pos;
            this._workingRange = range;
        };

        Creep.prototype.setAsObstacle = function (isObstacle: boolean) {
            this._isObstacle = isObstacle;
        };
    },

    /**
     * Processes all registered creep movement in room
     * @param room Room
     * @param costs CostMatrix of room
     * @param threshold value for depth-first search
     */
    run(room: Room, costs?: CostMatrix, threshold?: number) {
        movementMap = new Map();
        const creepsInRoom = room.find(FIND_MY_CREEPS);
        const creepsWithMovementIntent = [];

        for (const creep of creepsInRoom) {
            assignCreepToCoordinate(creep, creep.pos);
            if (creep._intendedCoordX !== undefined && creep._intendedCoordY !== undefined) {
                creepsWithMovementIntent.push(creep);
            }
        }

        for (const creep of creepsWithMovementIntent) {
            if (creep._matchedCoordX === creep._intendedCoordX && creep._matchedCoordY === creep._intendedCoordY) {
                continue;
            }

            visitedCreeps = {};

            movementMap.delete(creep._matchedCoordX! + 50 * creep._matchedCoordY!);
            delete creep._matchedCoordX;
            delete creep._matchedCoordY;

            if (depthFirstSearch(creep, 0, costs, threshold) > 0) {
                continue;
            }

            assignCreepToCoordinate(creep, creep.pos);
        }

        for (const creep of creepsInRoom) {

            if (creep.pos.x === creep._matchedCoordX && creep.pos.y === creep._matchedCoordY) {
                continue;
            }

            const direction = creep.pos.getDirectionTo(creep._matchedCoordX!, creep._matchedCoordY!);
            creep.move(direction);
        }
    },
};

function getPossibleMoves(creep: Creep, costs: CostMatrix | undefined, threshold: number = 255) {
    if (creep._cachedMoveOptions) {
        return creep._cachedMoveOptions;
    }

    const possibleMoves: Coord[] = [creep.pos];

    creep._cachedMoveOptions = possibleMoves;

    if (creep.fatigue > 0) {
        return possibleMoves;
    }

    if (creep._isObstacle) {
        return possibleMoves;
    }

    if (creep._intendedCoordX !== undefined && creep._intendedCoordY !== undefined) {
        possibleMoves.unshift({ x: creep._intendedCoordX!, y: creep._intendedCoordY! });
        return possibleMoves;
    }

    const adjacentCoords = Object.values(directionDelta).map((delta) => {
        return { x: creep.pos.x + delta.x, y: creep.pos.y + delta.y };
    });

    const roomTerrain = Game.map.getRoomTerrain(creep.room.name);

    const outOfWorkingArea: Coord[] = [];

    for (const adjacentCoord of _.shuffle(adjacentCoords)) {
        if (roomTerrain.get(adjacentCoord.x, adjacentCoord.y) === TERRAIN_MASK_WALL) {
            continue;
        }

        if (adjacentCoord.x === 0 || adjacentCoord.x === 49 || adjacentCoord.y === 0 || adjacentCoord.y === 49) {
            continue;
        }

        if (costs && costs.get(adjacentCoord.x, adjacentCoord.y) >= threshold) {
            continue;
        }

        if (creep._workingPos && creep._workingPos.getRangeTo(adjacentCoord.x, adjacentCoord.y) > creep._workingRange) {
            outOfWorkingArea.push(adjacentCoord);
            continue;
        } else {
            possibleMoves.push(adjacentCoord);
        }
    }

    return [..._.shuffle(possibleMoves), ..._.shuffle(outOfWorkingArea)];
}

function depthFirstSearch(
    creep: Creep,
    currentScore: number | undefined = 0,
    costs: CostMatrix | undefined,
    threshold: number | undefined,
): number {
    visitedCreeps[creep.name] = true;

    const possibleMoves = getPossibleMoves(creep, costs, threshold);

    const emptyTiles: Coord[] = [];

    const occupiedTiles: Coord[] = [];

    for (const coord of possibleMoves) {
        const packedCoord = coord.x + 50 * coord.y;
        if (movementMap.get(packedCoord)) {
            occupiedTiles.push(coord);
        } else {
            emptyTiles.push(coord);
        }
    }

    for (const coord of possibleMoves) {
        let score = currentScore;
        const packedCoord = coord.x + 50 * coord.y;

        if (creep._intendedCoordX === coord.x && creep._intendedCoordY === coord.y) {
            score++;
        }

        const occupyingCreep = movementMap.get(packedCoord);

        if (!occupyingCreep) {
            if (score > 0) {
                assignCreepToCoordinate(creep, coord);
            }
            return score;
        }

        if (!visitedCreeps[occupyingCreep.name]) {
            if (occupyingCreep._intendedCoordX === coord.x && occupyingCreep._intendedCoordY === coord.y) {
                score--;
            }

            const result = depthFirstSearch(occupyingCreep, score, costs, threshold);

            if (result > 0) {
                assignCreepToCoordinate(creep, coord);
                return result;
            }
        }
    }

    return -Infinity;
}

const directionDelta: { [key in DirectionConstant]: { x: number; y: number } } = {
    [TOP]: { x: 0, y: -1 },
    [TOP_RIGHT]: { x: 1, y: -1 },
    [RIGHT]: { x: 1, y: 0 },
    [BOTTOM_RIGHT]: { x: 1, y: 1 },
    [BOTTOM]: { x: 0, y: 1 },
    [BOTTOM_LEFT]: { x: -1, y: 1 },
    [LEFT]: { x: -1, y: 0 },
    [TOP_LEFT]: { x: -1, y: -1 },
};

function assignCreepToCoordinate(creep: Creep, coord: Coord) {
    const packedCoord = coord.x + 50 * coord.y;
    creep._matchedCoordX = coord.x;
    creep._matchedCoordY = coord.y;
    movementMap.set(packedCoord, creep);
}