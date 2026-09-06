import type { Repositories } from "@/lib/data/repositories/types";

export class CommentService {
  private readonly repos: Repositories;
  constructor(repos: Repositories) {
    this.repos = repos;
  }

  async list(diagramId: string, userId: string) {
    return this.repos.comments.list(diagramId, userId);
  }

  async create(diagramId: string, userId: string, text: string, x: number, y: number) {
    return this.repos.comments.create(diagramId, userId, text, x, y);
  }

  async remove(id: string, userId: string) {
    return this.repos.comments.delete(id, userId);
  }
}

export class AdrService {
  private readonly repos: Repositories;
  constructor(repos: Repositories) {
    this.repos = repos;
  }

  async list(diagramId: string, userId: string) {
    return this.repos.adrs.list(diagramId, userId);
  }

  async create(diagramId: string, userId: string, data: Parameters<Repositories["adrs"]["create"]>[2]) {
    return this.repos.adrs.create(diagramId, userId, data);
  }

  async update(id: string, userId: string, patch: Parameters<Repositories["adrs"]["update"]>[2]) {
    return this.repos.adrs.update(id, userId, patch);
  }

  async remove(id: string, userId: string) {
    return this.repos.adrs.delete(id, userId);
  }
}
